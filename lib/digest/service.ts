import { and, eq, gte, lte, isNotNull, desc } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { applications, activities } from '@/lib/db/schema'
import type { Application } from '@/lib/db/queries/applications'
import type { Job } from '@/lib/db/queries/jobs'
import type { Company } from '@/lib/db/queries/companies'
import type { Activity } from '@/lib/db/queries/activities'

const DAY_MS = 24 * 60 * 60 * 1000

export type UpcomingAction = Application & {
  job: Job & { company: Company | null }
}

export type RecentActivity = Pick<
  Activity,
  'id' | 'createdAt' | 'kind' | 'payload' | 'applicationId'
>

/**
 * Applications with a scheduled next_action within the coming N days,
 * ordered by soonest first.
 */
export async function getUpcomingActions(
  userId: string,
  withinDays = 7,
  client: DbClient = db,
): Promise<UpcomingAction[]> {
  const now = new Date()
  const horizon = new Date(now.getTime() + withinDays * DAY_MS)
  const rows = await client.query.applications.findMany({
    where: and(
      eq(applications.userId, userId),
      isNotNull(applications.nextActionAt),
      lte(applications.nextActionAt, horizon),
    ),
    with: { job: { with: { company: true } } },
    orderBy: (a, { asc }) => asc(a.nextActionAt),
  })
  return rows as UpcomingAction[]
}

/**
 * Recent activity rows across all of the user's applications, newest first,
 * capped at `limit` (default 100).
 */
export async function getRecentActivity(
  userId: string,
  withinDays = 7,
  limit = 100,
  client: DbClient = db,
): Promise<RecentActivity[]> {
  const since = new Date(Date.now() - withinDays * DAY_MS)
  return client
    .select({
      id: activities.id,
      createdAt: activities.createdAt,
      kind: activities.kind,
      payload: activities.payload,
      applicationId: activities.applicationId,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), gte(activities.createdAt, since)))
    .orderBy(desc(activities.createdAt))
    .limit(limit)
}
