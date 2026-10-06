import { and, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { academyAchievements, academyPlans, academyUserState } from '@/lib/db/schema'

/** Playground user state, daily plans and achievements. Every function is userId-scoped. */

export type UserStateRow = typeof academyUserState.$inferSelect
export type PlanRow = typeof academyPlans.$inferSelect
export type AchievementRow = typeof academyAchievements.$inferSelect

/** The user's state row, created with defaults on first use. */
export async function ensure(userId: string, client: DbClient = db): Promise<UserStateRow> {
  await client.insert(academyUserState).values({ userId }).onConflictDoNothing()
  const [row] = await client.select().from(academyUserState).where(eq(academyUserState.userId, userId)).limit(1)
  if (!row) throw new Error('academy_user_state row missing after insert')
  return row
}

export type StatePatch = Partial<Omit<typeof academyUserState.$inferInsert, 'userId'>>

export async function update(userId: string, patch: StatePatch, client: DbClient = db): Promise<void> {
  await client
    .update(academyUserState)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(academyUserState.userId, userId))
}

export async function getPlan(userId: string, date: string, client: DbClient = db): Promise<PlanRow | null> {
  const [row] = await client
    .select()
    .from(academyPlans)
    .where(and(eq(academyPlans.userId, userId), eq(academyPlans.date, date)))
    .limit(1)
  return row ?? null
}

export async function savePlan(
  userId: string,
  date: string,
  w: { items: unknown; signature: string; reason: string },
  client: DbClient = db,
): Promise<void> {
  const values = { items: w.items, signature: w.signature, reason: w.reason, generatedAt: new Date() }
  await client
    .insert(academyPlans)
    .values({ userId, date, ...values })
    .onConflictDoUpdate({ target: [academyPlans.userId, academyPlans.date], set: values })
}

/** Replace only the items (marking one done keeps the signature and reason). */
export async function setPlanItems(userId: string, date: string, items: unknown, client: DbClient = db): Promise<void> {
  await client
    .update(academyPlans)
    .set({ items })
    .where(and(eq(academyPlans.userId, userId), eq(academyPlans.date, date)))
}

export async function listAchievements(userId: string, client: DbClient = db): Promise<AchievementRow[]> {
  return client.select().from(academyAchievements).where(eq(academyAchievements.userId, userId))
}

export async function addAchievements(
  userId: string,
  ids: readonly string[],
  attemptId: string | null,
  client: DbClient = db,
): Promise<void> {
  if (ids.length === 0) return
  await client
    .insert(academyAchievements)
    .values(ids.map((achievementId) => ({ userId, achievementId, attemptId })))
    .onConflictDoNothing()
}
