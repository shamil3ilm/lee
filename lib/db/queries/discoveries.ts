import { and, arrayOverlaps, count, desc, eq, gte, inArray, isNotNull, lt, sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { discoveries } from '@/lib/db/schema'
import type * as schema from '@/lib/db/schema'
import { discoveryNotQuarantinedSql, discoveryQuarantinedSql } from './riskAssessments'

export type Discovery = typeof discoveries.$inferSelect
export type NewDiscovery = typeof discoveries.$inferInsert
/**
 * 'new' (inbox) · 'shortlisted' (triaged, worth a closer look) · 'saved'
 * (promoted to an application) · 'dismissed' · 'filtered' (failed the
 * user's search preferences; see lib/discovery/relevance). Plain text column.
 */
export type DiscoveryStatus = 'new' | 'shortlisted' | 'saved' | 'dismissed' | 'filtered'
export const DISCOVERY_STATUSES: readonly DiscoveryStatus[] = ['new', 'shortlisted', 'saved', 'dismissed', 'filtered']

/**
 * `DbClient` is a union of the postgres-js and PGlite drivers, and the union
 * hides drizzle's `returning(fields)` overload. Both drivers implement it
 * identically, so view the client through one driver's type to return only
 * the columns we need (ids — never the jsonb payload back over the wire).
 */
function writer(client: DbClient): PostgresJsDatabase<typeof schema> {
  return client as unknown as PostgresJsDatabase<typeof schema>
}

export interface UpsertResult {
  discovery: { id: string }
  isNew: boolean
}

/**
 * Insert-or-noop by (sourceId, sourceItemId). If a row already exists we
 * return its id and isNew=false; the caller uses that flag to skip
 * re-scoring items we've already seen. Only the id comes back — never the
 * `raw`/`normalized` jsonb, which the caller already has in memory.
 */
export async function upsertBySource(
  userId: string,
  sourceId: string,
  sourceItemId: string,
  raw: unknown,
  normalized: unknown,
  client: DbClient = db,
): Promise<UpsertResult> {
  const [inserted] = await writer(client)
    .insert(discoveries)
    .values({ userId, sourceId, sourceJobId: sourceItemId, raw: raw as never, normalized: normalized as never })
    .onConflictDoNothing({ target: [discoveries.sourceId, discoveries.sourceJobId] })
    .returning({ id: discoveries.id })
  if (inserted) return { discovery: inserted, isNew: true }
  const [existing] = await client
    .select({ id: discoveries.id })
    .from(discoveries)
    .where(and(eq(discoveries.sourceId, sourceId), eq(discoveries.sourceJobId, sourceItemId)))
    .limit(1)
  if (!existing) throw new Error('upsertBySource: could not insert or find discovery')
  return { discovery: existing, isNew: false }
}

export interface SeenDiscovery {
  id: string
  sourceJobId: string
  status: string
  /** No match score yet (thin profile, scoring cap, AI failure) — re-score. */
  unscored: boolean
}

/**
 * One query: which of these `sourceJobIds` does this source already have?
 * Selects ids and a scored flag only (no jsonb), keyed by source_job_id.
 * Uses the (source_id, source_job_id) unique index.
 */
export async function seenBySourceJobIds(
  sourceId: string,
  sourceJobIds: readonly string[],
  client: DbClient = db,
): Promise<Map<string, SeenDiscovery>> {
  if (sourceJobIds.length === 0) return new Map()
  const rows = await client
    .select({
      id: discoveries.id,
      sourceJobId: discoveries.sourceJobId,
      status: discoveries.status,
      unscored: sql<boolean>`${discoveries.matchScore} is null`,
    })
    .from(discoveries)
    .where(and(eq(discoveries.sourceId, sourceId), inArray(discoveries.sourceJobId, [...sourceJobIds])))
  return new Map(rows.map((r) => [r.sourceJobId, { ...r, unscored: Boolean(r.unscored) }]))
}

export interface NewDiscoveryItem {
  sourceJobId: string
  raw: unknown
  normalized: unknown
  /** Relevance gate outcome (lib/discovery/relevance); absent → an ungated 'new' row. */
  gate?: GateColumns
  /** Deterministic Match Score (lib/discovery/match); absent → backfilled later. */
  fit?: FitColumns
}

/** Columns the deterministic Match Score writes. */
export interface FitColumns {
  fitScore: number
  fitDetail: unknown
  fitKey: string
}

/** Columns the relevance gate writes. */
export interface GateColumns {
  status: 'new' | 'filtered'
  filterReason: string | null
  relevanceKey: string
  regions: string[]
  /** Region-taxonomy ids (lib/regions), ancestors included. */
  regionIds: string[]
  relevanceNotes: RelevanceNotes
  rankAdjust: number
}

export interface RelevanceNotes {
  penalties?: string[]
  boosts?: string[]
  infos?: string[]
}

/** Rows per INSERT — keeps statements (and their jsonb payloads) bounded. */
const INSERT_CHUNK = 100

/**
 * Bulk insert-or-noop for one source. Returns `{id, sourceJobId}` for rows
 * that were actually inserted; an item another run inserted concurrently is
 * silently skipped (ON CONFLICT DO NOTHING).
 */
export async function insertManyForSource(
  userId: string,
  sourceId: string,
  items: readonly NewDiscoveryItem[],
  client: DbClient = db,
): Promise<Array<{ id: string; sourceJobId: string }>> {
  const out: Array<{ id: string; sourceJobId: string }> = []
  for (let i = 0; i < items.length; i += INSERT_CHUNK) {
    const chunk = items.slice(i, i + INSERT_CHUNK)
    const rows = await writer(client)
      .insert(discoveries)
      .values(
        chunk.map((it) => ({
          userId,
          sourceId,
          sourceJobId: it.sourceJobId,
          raw: it.raw as never,
          normalized: it.normalized as never,
          ...(it.gate
            ? {
                status: it.gate.status,
                filterReason: it.gate.filterReason,
                relevanceKey: it.gate.relevanceKey,
                regions: it.gate.regions,
                regionIds: it.gate.regionIds,
                relevanceNotes: it.gate.relevanceNotes as never,
                rankAdjust: it.gate.rankAdjust,
              }
            : {}),
          ...(it.fit ? { fitScore: it.fit.fitScore, fitDetail: it.fit.fitDetail as never, fitKey: it.fit.fitKey } : {}),
        })),
      )
      .onConflictDoNothing({ target: [discoveries.sourceId, discoveries.sourceJobId] })
      .returning({ id: discoveries.id, sourceJobId: discoveries.sourceJobId })
    out.push(...rows)
  }
  return out
}

export interface ListOpts {
  status?: DiscoveryStatus | 'all'
  /** Several statuses at once (e.g. the inbox with "Hide filtered" off). Wins over `status`. */
  statuses?: readonly DiscoveryStatus[]
  /**
   * Minimum deterministic Match Score (`fit_score`). Rows the backfill has
   * not reached yet (fit_score NULL) stay visible.
   */
  minScore?: number
  /** Only rows with an AI score. */
  scoredOnly?: boolean
  sourceIds?: string[]
  /**
   * Region selection (lib/regions node ids). A row matches when its stored
   * region_ids overlap the selection; ancestors are stored, so "kerala"
   * matches a Kochi posting and "gcc" every Gulf one.
   */
  region?: readonly string[]
  sort?: 'combined' | 'match' | 'benefits' | 'posted'
  limit?: number
  /** Rows to skip — pairs with `limit` for inbox pagination. */
  offset?: number
  /** Only rows created at or after this instant (dashboard "fresh"). */
  createdAfter?: Date
  /**
   * v17 §1 — Scam Shield quarantine. 'exclude' (default) hides quarantined
   * rows, 'only' returns just them, 'include' ignores quarantine.
   */
  quarantine?: 'exclude' | 'only' | 'include'
}

/**
 * Lean inbox row: only what the discovery list renders. The heavy jsonb
 * columns (`raw`, and `normalized` with its description + raw copy) stay in
 * the database; the render fields are extracted in SQL.
 */
export interface DiscoveryListItem {
  id: string
  sourceId: string
  sourceJobId: string
  status: string
  matchScore: number | null
  benefitsScore: number | null
  matchReasoning: unknown
  /** Deterministic Match Score and its explanation (MatchDetail). */
  fitScore: number | null
  fitDetail: unknown
  /** Best CV for this posting (lib/cv-fit, BestCv). */
  bestCv: unknown
  scoredByCallId: string | null
  savedApplicationId: string | null
  createdAt: Date
  updatedAt: Date
  title: string | null
  companyName: string | null
  location: string | null
  remoteType: string | null
  techStack: string[]
  applyUrl: string | null
  filterReason: string | null
  filterOverride: boolean
  relevanceNotes: RelevanceNotes
}

const n = (key: string) => sql<string | null>`${discoveries.normalized}->>${key}`

const LIST_COLUMNS = {
  id: discoveries.id,
  sourceId: discoveries.sourceId,
  sourceJobId: discoveries.sourceJobId,
  status: discoveries.status,
  matchScore: discoveries.matchScore,
  benefitsScore: discoveries.benefitsScore,
  matchReasoning: discoveries.matchReasoning,
  fitScore: discoveries.fitScore,
  fitDetail: discoveries.fitDetail,
  bestCv: discoveries.bestCv,
  // v18 — id only; the usage badge loads the call lazily when expanded.
  scoredByCallId: discoveries.scoredByCallId,
  savedApplicationId: discoveries.savedApplicationId,
  createdAt: discoveries.createdAt,
  updatedAt: discoveries.updatedAt,
  title: n('title'),
  companyName: n('companyName'),
  location: n('location'),
  remoteType: n('remoteType'),
  techStack: sql<unknown>`case when jsonb_typeof(${discoveries.normalized}->'techStack') = 'array'
    then ${discoveries.normalized}->'techStack' else '[]'::jsonb end`,
  applyUrl: n('applyUrl'),
  filterReason: discoveries.filterReason,
  filterOverride: discoveries.filterOverride,
  relevanceNotes: discoveries.relevanceNotes,
}

/**
 * The ranking score (lib/discovery/match/blend.ts, same formula): the Match
 * Score, the AI score, or their rounded mean when both exist; NULL when
 * neither does.
 */
export function blendedSql(): SQL<number | null> {
  // The Match detail's ceiling (mandatory language unmet, title only) holds
  // the blend down, as cappedFit does on the card.
  return sql<number | null>`(case
    when ${discoveries.matchScore} is null and ${discoveries.fitScore} is null then null
    else least(
      (case
        when ${discoveries.matchScore} is null then ${discoveries.fitScore}
        when ${discoveries.fitScore} is null then ${discoveries.matchScore}
        else round((${discoveries.fitScore} + ${discoveries.matchScore}) / 2.0) end),
      coalesce((${discoveries.fitDetail} -> 'ceiling' ->> 'score')::numeric, 100)
    ) end)`
}

function listOrder(sort: ListOpts['sort']): SQL[] {
  const tiebreak = [desc(discoveries.createdAt), desc(discoveries.id)]
  switch (sort) {
    case 'match':
      // Best match first: Match blended with AI; soft-rule nudges
      // (rank_adjust) sink "lower priority" rows; unscored rows last.
      return [sql`(${blendedSql()} + ${discoveries.rankAdjust}) desc nulls last`, ...tiebreak]
    case 'benefits':
      return [desc(discoveries.benefitsScore), ...tiebreak]
    case 'posted':
      return tiebreak
    case 'combined':
    default:
      // Combined: 0.6 * blended match + 0.4 * benefits (nulls as 0) + rank_adjust.
      return [
        desc(
          sql`(coalesce(${blendedSql()}, 0) * 0.6 + coalesce(${discoveries.benefitsScore}, 0) * 0.4 + ${discoveries.rankAdjust})`,
        ),
        ...tiebreak,
      ]
  }
}

/** One WHERE for the list and its count, so "1–50 of 734" always agrees. */
function listWhere(userId: string, opts: ListOpts): SQL {
  const conds: SQL[] = [eq(discoveries.userId, userId)]
  if (opts.statuses && opts.statuses.length > 0) {
    conds.push(inArray(discoveries.status, [...opts.statuses]))
  } else if (opts.status && opts.status !== 'all') {
    conds.push(eq(discoveries.status, opts.status))
  }
  if (opts.scoredOnly) conds.push(isNotNull(discoveries.matchScore))
  if (typeof opts.minScore === 'number' && opts.minScore > 0) {
    // The same number as the Fit badge (Match / AI blend); unscored rows stay.
    const fit = blendedSql()
    conds.push(sql`(${fit} >= ${opts.minScore} or ${fit} is null)`)
  }
  if (opts.sourceIds && opts.sourceIds.length > 0) {
    conds.push(inArray(discoveries.sourceId, opts.sourceIds))
  }
  if (opts.region && opts.region.length > 0) conds.push(arrayOverlaps(discoveries.regionIds, [...opts.region]))
  if (opts.createdAfter) conds.push(gte(discoveries.createdAt, opts.createdAfter))
  const quarantine = opts.quarantine ?? 'exclude'
  if (quarantine === 'exclude') conds.push(discoveryNotQuarantinedSql())
  if (quarantine === 'only') conds.push(discoveryQuarantinedSql())
  return and(...conds)!
}

export async function list(
  userId: string,
  opts: ListOpts = {},
  client: DbClient = db,
): Promise<DiscoveryListItem[]> {
  const base = client
    .select(LIST_COLUMNS)
    .from(discoveries)
    .where(listWhere(userId, opts))
    .orderBy(...listOrder(opts.sort))
    .$dynamic()
  const limited = opts.limit !== undefined ? base.limit(opts.limit) : base
  const rows = await (opts.offset ? limited.offset(opts.offset) : limited)
  return rows.map((r) => ({
    ...r,
    techStack: Array.isArray(r.techStack) ? (r.techStack as unknown[]).map(String) : [],
    relevanceNotes: (r.relevanceNotes ?? {}) as RelevanceNotes,
  }))
}

/** Total rows `list` would return without limit/offset — one count query. */
export async function countList(
  userId: string,
  opts: Omit<ListOpts, 'limit' | 'offset' | 'sort'> = {},
  client: DbClient = db,
): Promise<number> {
  const [row] = await client.select({ c: count() }).from(discoveries).where(listWhere(userId, opts))
  return Number(row?.c ?? 0)
}

/**
 * Which of these apply URLs the user already has as a discovery from ANY
 * source (cross-source dedupe for link-only sources such as Google Alerts).
 */
export async function existingApplyUrls(
  userId: string,
  urls: readonly string[],
  client: DbClient = db,
): Promise<Set<string>> {
  if (urls.length === 0) return new Set()
  const rows = await client
    .select({ url: sql<string | null>`${discoveries.normalized}->>'applyUrl'` })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inArray(sql`${discoveries.normalized}->>'applyUrl'`, [...urls])))
  return new Set(rows.map((r) => r.url).filter((u): u is string => Boolean(u)))
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Discovery | undefined> {
  return client.query.discoveries.findFirst({
    where: and(eq(discoveries.userId, userId), eq(discoveries.id, id)),
  })
}

export async function updateScore(
  userId: string,
  id: string,
  matchScore: number,
  benefitsScoreValue: number,
  reasoning: unknown,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(discoveries)
    .set({
      matchScore,
      benefitsScore: benefitsScoreValue,
      matchReasoning: reasoning as never,
      updatedAt: new Date(),
    })
    .where(and(eq(discoveries.userId, userId), eq(discoveries.id, id)))
}

/**
 * v10.1 — persist the ai_call_logs row id that produced this discovery's
 * score. Called by the discovery service right after AI scoring succeeds
 * so dismiss/save actions can later flip `user_action` on the exact call.
 * Best-effort: an unknown discovery/user is a silent no-op.
 */
export async function updateScoredByCallId(
  userId: string,
  id: string,
  callId: string,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(discoveries)
    .set({ scoredByCallId: callId, updatedAt: new Date() })
    .where(and(eq(discoveries.userId, userId), eq(discoveries.id, id)))
}

export async function setStatus(
  userId: string,
  id: string,
  status: DiscoveryStatus,
  extra: Partial<NewDiscovery> = {},
  client: DbClient = db,
): Promise<void> {
  await client
    .update(discoveries)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(and(eq(discoveries.userId, userId), eq(discoveries.id, id)))
}

/**
 * Dismiss many discoveries in a single UPDATE. Empty `ids` is a no-op.
 * Inbox (`new`) and filtered-out rows transition; returns how many did.
 */
export async function dismissByIds(
  userId: string,
  ids: string[],
  client: DbClient = db,
): Promise<number> {
  if (ids.length === 0) return 0
  const rows = await writer(client)
    .update(discoveries)
    .set({ status: 'dismissed', updatedAt: new Date() })
    .where(
      and(
        eq(discoveries.userId, userId),
        inArray(discoveries.id, ids),
        inArray(discoveries.status, ['new', 'filtered']),
      ),
    )
    .returning({ id: discoveries.id })
  return rows.length
}

/**
 * Undo a dismiss: move the given `dismissed` discoveries back to `new` in one
 * UPDATE. Rows in any other status (saved, new) are left alone. Returns the
 * restored rows' scoring-call ids so the caller can retract the implicit
 * "dismissed" feedback signal.
 */
export async function restoreByIds(
  userId: string,
  ids: string[],
  client: DbClient = db,
): Promise<Array<{ id: string; scoredByCallId: string | null }>> {
  if (ids.length === 0) return []
  return writer(client)
    .update(discoveries)
    .set({ status: 'new', updatedAt: new Date() })
    .where(
      and(
        eq(discoveries.userId, userId),
        inArray(discoveries.id, ids),
        eq(discoveries.status, 'dismissed'),
      ),
    )
    .returning({ id: discoveries.id, scoredByCallId: discoveries.scoredByCallId })
}

/**
 * Dismiss every `new` discovery for the user that was created more than
 * `days` days ago. Returns the number of rows affected.
 */
export async function dismissOlderThan(
  userId: string,
  days: number,
  client: DbClient = db,
): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await client
    .update(discoveries)
    .set({ status: 'dismissed', updatedAt: new Date() })
    .where(
      and(
        eq(discoveries.userId, userId),
        eq(discoveries.status, 'new'),
        lt(discoveries.createdAt, cutoff),
      ),
    )
    .returning()
  return rows.length
}

/**
 * Count of unreviewed (`status='new'`) discoveries — powers the nav badge.
 * Quarantined (likely-scam) rows are not counted.
 */
export async function countNew(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ c: count() })
    .from(discoveries)
    .where(
      and(
        eq(discoveries.userId, userId),
        eq(discoveries.status, 'new'),
        discoveryNotQuarantinedSql(),
      ),
    )
  return Number(row?.c ?? 0)
}

/**
 * Per-status counts for the triage board, excluding Scam Shield quarantine.
 * One grouped scan on (user_id, status); `filters` (region, source, minimum
 * score, scored only) narrow it the same way they narrow the list.
 */
export async function countByStatus(
  userId: string,
  client: DbClient = db,
  filters: Pick<ListOpts, 'region' | 'sourceIds' | 'minScore' | 'scoredOnly'> = {},
): Promise<Record<DiscoveryStatus, number>> {
  const rows = await client
    .select({ status: discoveries.status, c: count() })
    .from(discoveries)
    .where(listWhere(userId, { ...filters, quarantine: 'exclude' }))
    .groupBy(discoveries.status)
  const out: Record<DiscoveryStatus, number> = { new: 0, shortlisted: 0, saved: 0, dismissed: 0, filtered: 0 }
  for (const r of rows) {
    if ((DISCOVERY_STATUSES as readonly string[]).includes(r.status)) {
      out[r.status as DiscoveryStatus] = Number(r.c)
    }
  }
  return out
}

/**
 * Postings per region node under the list's filters (every row counts at
 * each id it stores, so GCC ≥ UAE ≥ Dubai). One grouped scan over unnest().
 */
export async function countByRegion(
  userId: string,
  opts: ListOpts,
  client: DbClient = db,
): Promise<Map<string, number>> {
  const rows = await client.execute(sql`
    select r.id as id, count(*) as c
    from ${discoveries}, unnest(${discoveries.regionIds}) as r(id)
    where ${listWhere(userId, opts)}
    group by r.id
  `)
  const list = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])
  const typed = (Array.isArray(list) ? list : []) as Array<{ id: string; c: number | string }>
  return new Map(typed.map((r) => [r.id, Number(r.c)]))
}

/** v17 §1 — how many discoveries sit in Scam Shield quarantine (any status). */
export async function countQuarantined(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ c: count() })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), discoveryQuarantinedSql()))
  return Number(row?.c ?? 0)
}
