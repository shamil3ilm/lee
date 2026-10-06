import { and, asc, count, eq, lte } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { academyReviews } from '@/lib/db/schema'

/** SM-2 card state. Every function is userId-scoped. */

export type ReviewRow = typeof academyReviews.$inferSelect

export async function dueCount(userId: string, now: Date, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ n: count() })
    .from(academyReviews)
    .where(and(eq(academyReviews.userId, userId), lte(academyReviews.dueAt, now)))
  return Number(row?.n ?? 0)
}

export async function listDue(userId: string, now: Date, limit = 20, client: DbClient = db): Promise<ReviewRow[]> {
  return client
    .select()
    .from(academyReviews)
    .where(and(eq(academyReviews.userId, userId), lte(academyReviews.dueAt, now)))
    .orderBy(asc(academyReviews.dueAt))
    .limit(limit)
}

export async function get(userId: string, cardId: string, client: DbClient = db): Promise<ReviewRow | null> {
  const [row] = await client
    .select()
    .from(academyReviews)
    .where(and(eq(academyReviews.userId, userId), eq(academyReviews.cardId, cardId)))
    .limit(1)
  return row ?? null
}

/** Start tracking cards the user just met; cards already tracked are left alone. */
export async function enroll(
  userId: string,
  cards: ReadonlyArray<{ cardId: string; skillId: string; dueAt: Date }>,
  client: DbClient = db,
): Promise<void> {
  if (cards.length === 0) return
  await client
    .insert(academyReviews)
    .values(cards.map((c) => ({ userId, ...c })))
    .onConflictDoNothing()
}

export interface ReviewWrite {
  ease: number
  intervalDays: number
  repetitions: number
  lapses: number
  dueAt: Date
  lastReviewedAt: Date
}

export async function update(userId: string, cardId: string, w: ReviewWrite, client: DbClient = db): Promise<void> {
  await client
    .update(academyReviews)
    .set(w)
    .where(and(eq(academyReviews.userId, userId), eq(academyReviews.cardId, cardId)))
}
