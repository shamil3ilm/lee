import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db, type DbClient } from '@/lib/db/client'
import { companyDiscoveries } from '@/lib/db/schema'
import type * as schema from '@/lib/db/schema'

export type CompanyDiscovery = typeof companyDiscoveries.$inferSelect
export type NewCompanyDiscovery = typeof companyDiscoveries.$inferInsert
export type CompanyDiscoveryStatus = 'new' | 'saved' | 'dismissed'

/** See discoveries.ts `writer`: exposes `returning(fields)` on the driver union. */
function writer(client: DbClient): PostgresJsDatabase<typeof schema> {
  return client as unknown as PostgresJsDatabase<typeof schema>
}

export interface SeenCompanyDiscovery {
  id: string
  sourceCompanyId: string
  unscored: boolean
}

/** One query: which of these ids does this source already have? (ids + scored flag only) */
export async function seenBySourceCompanyIds(
  sourceId: string,
  sourceCompanyIds: readonly string[],
  client: DbClient = db,
): Promise<Map<string, SeenCompanyDiscovery>> {
  if (sourceCompanyIds.length === 0) return new Map()
  const rows = await client
    .select({
      id: companyDiscoveries.id,
      sourceCompanyId: companyDiscoveries.sourceCompanyId,
      unscored: sql<boolean>`${companyDiscoveries.matchScore} is null`,
    })
    .from(companyDiscoveries)
    .where(
      and(
        eq(companyDiscoveries.sourceId, sourceId),
        inArray(companyDiscoveries.sourceCompanyId, [...sourceCompanyIds]),
      ),
    )
  return new Map(rows.map((r) => [r.sourceCompanyId, { ...r, unscored: Boolean(r.unscored) }]))
}

const INSERT_CHUNK = 100

/** Bulk insert-or-noop for one source; returns ids of rows actually inserted. */
export async function insertManyForSource(
  userId: string,
  sourceId: string,
  items: ReadonlyArray<{ sourceCompanyId: string; raw: unknown; normalized: unknown }>,
  client: DbClient = db,
): Promise<Array<{ id: string; sourceCompanyId: string }>> {
  const out: Array<{ id: string; sourceCompanyId: string }> = []
  for (let i = 0; i < items.length; i += INSERT_CHUNK) {
    const rows = await writer(client)
      .insert(companyDiscoveries)
      .values(
        items.slice(i, i + INSERT_CHUNK).map((it) => ({
          userId,
          sourceId,
          sourceCompanyId: it.sourceCompanyId,
          raw: it.raw as never,
          normalized: it.normalized as never,
        })),
      )
      .onConflictDoNothing({
        target: [companyDiscoveries.sourceId, companyDiscoveries.sourceCompanyId],
      })
      .returning({ id: companyDiscoveries.id, sourceCompanyId: companyDiscoveries.sourceCompanyId })
    out.push(...rows)
  }
  return out
}

export interface UpsertCompanyResult {
  discovery: CompanyDiscovery
  isNew: boolean
}

export async function upsertBySource(
  userId: string,
  sourceId: string,
  sourceItemId: string,
  raw: unknown,
  normalized: unknown,
  client: DbClient = db,
): Promise<UpsertCompanyResult> {
  const [inserted] = await client
    .insert(companyDiscoveries)
    .values({
      userId,
      sourceId,
      sourceCompanyId: sourceItemId,
      raw: raw as never,
      normalized: normalized as never,
    })
    .onConflictDoNothing({
      target: [companyDiscoveries.sourceId, companyDiscoveries.sourceCompanyId],
    })
    .returning()
  if (inserted) return { discovery: inserted, isNew: true }
  const existing = await client.query.companyDiscoveries.findFirst({
    where: and(
      eq(companyDiscoveries.sourceId, sourceId),
      eq(companyDiscoveries.sourceCompanyId, sourceItemId),
    ),
  })
  if (!existing) throw new Error('upsertBySource(company): could not insert or find')
  return { discovery: existing, isNew: false }
}

export interface ListOpts {
  status?: CompanyDiscoveryStatus | 'all'
  minScore?: number
  sourceIds?: string[]
  limit?: number
  /** Rows to skip — pairs with `limit` for inbox pagination. */
  offset?: number
}

export async function list(
  userId: string,
  opts: ListOpts = {},
  client: DbClient = db,
): Promise<CompanyDiscovery[]> {
  const conds = [eq(companyDiscoveries.userId, userId)]
  if (opts.status && opts.status !== 'all') {
    conds.push(eq(companyDiscoveries.status, opts.status))
  }
  if (typeof opts.minScore === 'number') {
    conds.push(
      or(
        gte(companyDiscoveries.matchScore, opts.minScore),
        isNull(companyDiscoveries.matchScore),
      )!,
    )
  }
  if (opts.sourceIds && opts.sourceIds.length > 0) {
    conds.push(inArray(companyDiscoveries.sourceId, opts.sourceIds))
  }
  return client.query.companyDiscoveries.findMany({
    where: and(...conds),
    orderBy: (d, { desc }) => [desc(d.matchScore), desc(d.createdAt), desc(d.id)],
    limit: opts.limit,
    offset: opts.offset,
  })
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<CompanyDiscovery | undefined> {
  return client.query.companyDiscoveries.findFirst({
    where: and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.id, id)),
  })
}

export async function updateScore(
  userId: string,
  id: string,
  matchScore: number,
  reasoning: unknown,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(companyDiscoveries)
    .set({ matchScore, matchReasoning: reasoning as never, updatedAt: new Date() })
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.id, id)))
}

/**
 * v10.1 — same as discoveries.updateScoredByCallId; persists the ai_call_logs
 * row id that produced the score onto the company discovery row so dismiss/
 * save actions can later attribute an implicit rating signal to that call.
 */
export async function updateScoredByCallId(
  userId: string,
  id: string,
  callId: string,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(companyDiscoveries)
    .set({ scoredByCallId: callId, updatedAt: new Date() })
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.id, id)))
}

export async function setStatus(
  userId: string,
  id: string,
  status: CompanyDiscoveryStatus,
  extra: Partial<NewCompanyDiscovery> = {},
  client: DbClient = db,
): Promise<void> {
  await client
    .update(companyDiscoveries)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.id, id)))
}

/** Undo a dismiss on one company discovery (dismissed → new only). */
export async function restoreById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<{ id: string; scoredByCallId: string | null } | null> {
  const [row] = await writer(client)
    .update(companyDiscoveries)
    .set({ status: 'new', updatedAt: new Date() })
    .where(
      and(
        eq(companyDiscoveries.userId, userId),
        eq(companyDiscoveries.id, id),
        eq(companyDiscoveries.status, 'dismissed'),
      ),
    )
    .returning({ id: companyDiscoveries.id, scoredByCallId: companyDiscoveries.scoredByCallId })
  return row ?? null
}
