import { and, asc, eq, inArray } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { academyRatingHistory, academySkillRatings } from '@/lib/db/schema'

/** Skill ratings and their append-only history. Every function is userId-scoped. */

export type SkillRatingRow = typeof academySkillRatings.$inferSelect
export type RatingHistoryRow = typeof academyRatingHistory.$inferSelect

export async function list(userId: string, client: DbClient = db): Promise<SkillRatingRow[]> {
  return client.select().from(academySkillRatings).where(eq(academySkillRatings.userId, userId))
}

export async function get(userId: string, skillId: string, client: DbClient = db): Promise<SkillRatingRow | null> {
  const [row] = await client
    .select()
    .from(academySkillRatings)
    .where(and(eq(academySkillRatings.userId, userId), eq(academySkillRatings.skillId, skillId)))
    .limit(1)
  return row ?? null
}

export interface RatingWrite {
  skillId: string
  rating: number
  deviation: number
  level: number
  attempts: number
  lastPracticedAt: Date | null
  seed: unknown
}

export async function upsert(userId: string, w: RatingWrite, client: DbClient = db): Promise<void> {
  const values = { ...w, seed: w.seed ?? null, updatedAt: new Date() }
  await client
    .insert(academySkillRatings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: [academySkillRatings.userId, academySkillRatings.skillId], set: values })
}

/** Remove seed-only rows (no attempts) whose evidence is gone. */
export async function removeUnpracticed(userId: string, skillIds: readonly string[], client: DbClient = db): Promise<void> {
  if (skillIds.length === 0) return
  await client
    .delete(academySkillRatings)
    .where(
      and(
        eq(academySkillRatings.userId, userId),
        inArray(academySkillRatings.skillId, [...skillIds]),
        eq(academySkillRatings.attempts, 0),
      ),
    )
}

export interface HistoryWrite {
  skillId: string
  attemptId: string | null
  kind: 'attempt' | 'diagnostic' | 'placement'
  rating: number
  deviation: number
  level: number
}

export async function addHistory(userId: string, rows: readonly HistoryWrite[], client: DbClient = db): Promise<void> {
  if (rows.length === 0) return
  await client.insert(academyRatingHistory).values(rows.map((r) => ({ userId, ...r })))
}

export async function history(userId: string, skillId: string, limit = 200, client: DbClient = db): Promise<RatingHistoryRow[]> {
  return client
    .select()
    .from(academyRatingHistory)
    .where(and(eq(academyRatingHistory.userId, userId), eq(academyRatingHistory.skillId, skillId)))
    .orderBy(asc(academyRatingHistory.createdAt))
    .limit(limit)
}
