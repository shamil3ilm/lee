import { and, count, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'

export type Discovery = typeof discoveries.$inferSelect
export type NewDiscovery = typeof discoveries.$inferInsert
export type DiscoveryStatus = 'new' | 'saved' | 'dismissed'

export interface UpsertResult {
  discovery: Discovery
  isNew: boolean
}

/**
 * Insert-or-noop by (sourceId, sourceItemId). If a row already exists we
 * return the existing row and isNew=false; the caller uses that flag to skip
 * re-scoring items we've already seen.
 */
export async function upsertBySource(
  userId: string,
  sourceId: string,
  sourceItemId: string,
  raw: unknown,
  normalized: unknown,
  client: DbClient = db,
): Promise<UpsertResult> {
  const [inserted] = await client
    .insert(discoveries)
    .values({ userId, sourceId, sourceJobId: sourceItemId, raw: raw as never, normalized: normalized as never })
    .onConflictDoNothing({ target: [discoveries.sourceId, discoveries.sourceJobId] })
    .returning()
  if (inserted) return { discovery: inserted, isNew: true }
  const existing = await client.query.discoveries.findFirst({
    where: and(
      eq(discoveries.sourceId, sourceId),
      eq(discoveries.sourceJobId, sourceItemId),
    ),
  })
  if (!existing) throw new Error('upsertBySource: could not insert or find discovery')
  return { discovery: existing, isNew: false }
}

export interface ListOpts {
  status?: DiscoveryStatus | 'all'
  minScore?: number
  sourceIds?: string[]
  sort?: 'combined' | 'match' | 'benefits' | 'posted'
  limit?: number
}

export async function list(
  userId: string,
  opts: ListOpts = {},
  client: DbClient = db,
): Promise<Discovery[]> {
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
  return client.query.discoveries.findMany({
    where: and(...conds),
    orderBy: (d, { desc }) => {
      switch (opts.sort) {
        case 'match':
          return [desc(d.matchScore), desc(d.createdAt)]
        case 'benefits':
          return [desc(d.benefitsScore), desc(d.createdAt)]
        case 'posted':
          return [desc(d.createdAt)]
        case 'combined':
        default:
          // Combined: 0.6 * match + 0.4 * benefits, coalesce nulls to 0.
          return [
            desc(
              sql`(coalesce(${d.matchScore}, 0) * 0.6 + coalesce(${d.benefitsScore}, 0) * 0.4)`,
            ),
            desc(d.createdAt),
          ]
      }
    },
    limit: opts.limit,
  })
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

/** Count of unreviewed (`status='new'`) discoveries — powers the nav badge. */
export async function countNew(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ c: count() })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), eq(discoveries.status, 'new')))
  return Number(row?.c ?? 0)
}
