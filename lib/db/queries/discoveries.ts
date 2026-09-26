import { and, count, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { discoveries } from '@/lib/db/schema'
import type * as schema from '@/lib/db/schema'
import { discoveryNotQuarantinedSql, discoveryQuarantinedSql } from './riskAssessments'

export type Discovery = typeof discoveries.$inferSelect
export type NewDiscovery = typeof discoveries.$inferInsert
export type DiscoveryStatus = 'new' | 'saved' | 'dismissed'

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
  minScore?: number
  sourceIds?: string[]
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
  createdAt: Date
  updatedAt: Date
  title: string | null
  companyName: string | null
  location: string | null
  remoteType: string | null
  techStack: string[]
  applyUrl: string | null
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
  createdAt: discoveries.createdAt,
  updatedAt: discoveries.updatedAt,
  title: n('title'),
  companyName: n('companyName'),
  location: n('location'),
  remoteType: n('remoteType'),
  techStack: sql<unknown>`case when jsonb_typeof(${discoveries.normalized}->'techStack') = 'array'
    then ${discoveries.normalized}->'techStack' else '[]'::jsonb end`,
  applyUrl: n('applyUrl'),
}

function listOrder(sort: ListOpts['sort']): SQL[] {
  const tiebreak = [desc(discoveries.createdAt), desc(discoveries.id)]
  switch (sort) {
    case 'match':
      return [desc(discoveries.matchScore), ...tiebreak]
    case 'benefits':
      return [desc(discoveries.benefitsScore), ...tiebreak]
    case 'posted':
      return tiebreak
    case 'combined':
    default:
      // Combined: 0.6 * match + 0.4 * benefits, coalesce nulls to 0.
      return [
        desc(
          sql`(coalesce(${discoveries.matchScore}, 0) * 0.6 + coalesce(${discoveries.benefitsScore}, 0) * 0.4)`,
        ),
        ...tiebreak,
      ]
  }
}

export async function list(
  userId: string,
  opts: ListOpts = {},
  client: DbClient = db,
): Promise<DiscoveryListItem[]> {
  const conds = [eq(discoveries.userId, userId)]
  if (opts.status && opts.status !== 'all') {
    conds.push(eq(discoveries.status, opts.status))
  }
  if (typeof opts.minScore === 'number') {
    // Include rows without a score too (matchScore IS NULL) so users see fresh
    // items that haven't been scored yet.
    conds.push(
      or(
        gte(discoveries.matchScore, opts.minScore),
        isNull(discoveries.matchScore),
      )!,
    )
  }
  if (opts.sourceIds && opts.sourceIds.length > 0) {
    conds.push(inArray(discoveries.sourceId, opts.sourceIds))
  }
  if (opts.createdAfter) conds.push(gte(discoveries.createdAt, opts.createdAfter))
  const quarantine = opts.quarantine ?? 'exclude'
  if (quarantine === 'exclude') conds.push(discoveryNotQuarantinedSql())
  if (quarantine === 'only') conds.push(discoveryQuarantinedSql())
  const base = client
    .select(LIST_COLUMNS)
    .from(discoveries)
    .where(and(...conds))
    .orderBy(...listOrder(opts.sort))
    .$dynamic()
  const limited = opts.limit !== undefined ? base.limit(opts.limit) : base
  const rows = await (opts.offset ? limited.offset(opts.offset) : limited)
  return rows.map((r) => ({
    ...r,
    techStack: Array.isArray(r.techStack) ? (r.techStack as unknown[]).map(String) : [],
  }))
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
 * Returns the number of rows that transitioned.
 */
export async function dismissByIds(
  userId: string,
  ids: string[],
  client: DbClient = db,
): Promise<number> {
  if (ids.length === 0) return 0
  const rows = await client
    .update(discoveries)
    .set({ status: 'dismissed', updatedAt: new Date() })
    .where(
      and(
        eq(discoveries.userId, userId),
        inArray(discoveries.id, ids),
        eq(discoveries.status, 'new'),
      ),
    )
    .returning()
  return rows.length
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

/** v17 §1 — how many discoveries sit in Scam Shield quarantine (any status). */
export async function countQuarantined(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ c: count() })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), discoveryQuarantinedSql()))
  return Number(row?.c ?? 0)
}
