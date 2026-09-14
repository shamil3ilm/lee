import { and, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { activities } from '@/lib/db/schema'

export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert

export async function log(
  userId: string,
  applicationId: string,
  kind: string,
  payload: Record<string, unknown>,
  client: DbClient = db,
): Promise<Activity> {
  const [row] = await client
    .insert(activities)
    .values({ userId, applicationId, kind, payload })
    .returning()
  if (!row) throw new Error('failed to insert activity')
  return row
}

export async function list(
  userId: string,
  applicationId: string,
  opts: { limit?: number } = {},
  client: DbClient = db,
): Promise<Activity[]> {
  return client.query.activities.findMany({
    where: and(
      eq(activities.userId, userId),
      eq(activities.applicationId, applicationId),
    ),
    orderBy: (a, { desc }) => desc(a.createdAt),
    limit: opts.limit,
  })
}
