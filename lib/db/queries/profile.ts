import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { userProfile } from '@/lib/db/schema'

export type UserProfile = typeof userProfile.$inferSelect
export type NewUserProfile = typeof userProfile.$inferInsert

export async function get(userId: string): Promise<UserProfile | null> {
  const row = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  })
  return row ?? null
}

/**
 * Insert-or-update the profile for `userId`. The `user_id` column is UNIQUE,
 * so a conflict lets us patch the existing row in a single statement. Callers
 * only need to send the columns they want to change — undefined keys are
 * stripped so we do not overwrite existing values with nulls.
 */
export async function upsert(
  userId: string,
  patch: Partial<NewUserProfile>,
): Promise<UserProfile> {
  // Strip undefined so onConflictDoUpdate does not null-out omitted columns.
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) clean[key] = value
  }

  const [row] = await db
    .insert(userProfile)
    .values({ userId, ...clean } as NewUserProfile)
    .onConflictDoUpdate({
      target: userProfile.userId,
      set: { ...clean, updatedAt: new Date() },
    })
    .returning()
  if (!row) throw new Error('failed to upsert user_profile')
  return row
}
