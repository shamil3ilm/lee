import { and, count, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { academyAttempts } from '@/lib/db/schema'

/** Playground attempts: append-only records (v13 §10.1). Every function is userId-scoped. */

export type AttemptRow = typeof academyAttempts.$inferSelect
export type NewAttempt = Omit<typeof academyAttempts.$inferInsert, 'userId' | 'id'>

export async function create(userId: string, values: NewAttempt, client: DbClient = db): Promise<AttemptRow> {
  const [row] = await client
    .insert(academyAttempts)
    .values({ ...values, userId })
    .returning()
  if (!row) throw new Error('academy_attempts insert returned no row')
  return row
}

export async function get(userId: string, id: string, client: DbClient = db): Promise<AttemptRow | null> {
  const [row] = await client
    .select()
    .from(academyAttempts)
    .where(and(eq(academyAttempts.userId, userId), eq(academyAttempts.id, id)))
    .limit(1)
  return row ?? null
}

export interface SubmitWrite {
  submittedAt: Date
  elapsedSec: number
  submission: unknown
  evaluation: unknown
  composite: number
  xpAwarded: number
  ratingBefore: number
  ratingAfter: number
}

/**
 * Record the result once. Returns null when the attempt was already
 * submitted (a double click or a replayed request), so nothing is counted twice.
 */
export async function submit(userId: string, id: string, w: SubmitWrite, client: DbClient = db): Promise<AttemptRow | null> {
  const [row] = await client
    .update(academyAttempts)
    .set(w)
    .where(and(eq(academyAttempts.userId, userId), eq(academyAttempts.id, id), isNull(academyAttempts.submittedAt)))
    .returning()
  return row ?? null
}

export interface HistoryFilter {
  skillId?: string
  limit?: number
}

/** Submitted attempts, newest first. */
export async function listSubmitted(userId: string, f: HistoryFilter = {}, client: DbClient = db): Promise<AttemptRow[]> {
  const filters = [eq(academyAttempts.userId, userId), isNotNull(academyAttempts.submittedAt)]
  if (f.skillId) filters.push(eq(academyAttempts.skillId, f.skillId))
  return client
    .select()
    .from(academyAttempts)
    .where(and(...filters))
    .orderBy(desc(academyAttempts.submittedAt))
    .limit(Math.min(f.limit ?? 50, 200))
}

/** Item ids of the latest attempts (most recent first), for the repetition penalty. */
export async function recentItemIds(userId: string, limit = 30, client: DbClient = db): Promise<string[]> {
  const rows = await client
    .select({ itemId: academyAttempts.itemId })
    .from(academyAttempts)
    .where(eq(academyAttempts.userId, userId))
    .orderBy(desc(academyAttempts.startedAt))
    .limit(limit)
  return rows.map((r) => r.itemId)
}

/** Diagnostic attempts submitted since the placement started. */
export async function diagnosticSince(
  userId: string,
  since: Date,
  client: DbClient = db,
): Promise<Array<{ itemId: string; skillId: string }>> {
  return client
    .select({ itemId: academyAttempts.itemId, skillId: academyAttempts.skillId })
    .from(academyAttempts)
    .where(
      and(
        eq(academyAttempts.userId, userId),
        eq(academyAttempts.mode, 'diagnostic'),
        isNotNull(academyAttempts.submittedAt),
        gte(academyAttempts.startedAt, since),
      ),
    )
}

/** An unfinished attempt for this item started today (resume instead of duplicating). */
export async function openFor(userId: string, itemId: string, since: Date, client: DbClient = db): Promise<AttemptRow | null> {
  const [row] = await client
    .select()
    .from(academyAttempts)
    .where(
      and(
        eq(academyAttempts.userId, userId),
        eq(academyAttempts.itemId, itemId),
        isNull(academyAttempts.submittedAt),
        gte(academyAttempts.startedAt, since),
      ),
    )
    .orderBy(desc(academyAttempts.startedAt))
    .limit(1)
  return row ?? null
}

export interface AttemptCounts {
  attempts: number
  skills: string[]
}

export async function counts(userId: string, client: DbClient = db): Promise<AttemptCounts> {
  const rows = await client
    .select({ skillId: academyAttempts.skillId, n: count() })
    .from(academyAttempts)
    .where(and(eq(academyAttempts.userId, userId), isNotNull(academyAttempts.submittedAt)))
    .groupBy(academyAttempts.skillId)
  return { attempts: rows.reduce((s, r) => s + Number(r.n), 0), skills: rows.map((r) => r.skillId) }
}

export async function countAtLeast(userId: string, minComposite: number, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ n: count() })
    .from(academyAttempts)
    .where(and(eq(academyAttempts.userId, userId), sql`${academyAttempts.composite} >= ${minComposite}`))
  return Number(row?.n ?? 0)
}
