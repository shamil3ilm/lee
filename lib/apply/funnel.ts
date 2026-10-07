import { and, countDistinct, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, applications } from '@/lib/db/schema'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import * as shortlistQ from '@/lib/db/queries/shortlist'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { localDay, weekStart } from './dates'

/**
 * "This week" (Monday in the user's timezone → now):
 * shortlisted → prepared → applied → replied → interview. Each step counts
 * what happened this week, so later steps can come from earlier weeks'
 * applications. Five small indexed counts.
 */

export interface WeekFunnel {
  since: Date
  shortlisted: number
  prepared: number
  applied: number
  replied: number
  interview: number
}

export const FUNNEL_STEPS = ['shortlisted', 'prepared', 'applied', 'replied', 'interview'] as const
export type FunnelStep = (typeof FUNNEL_STEPS)[number]
export const FUNNEL_LABELS: Readonly<Record<FunnelStep, string>> = {
  shortlisted: 'Shortlisted',
  prepared: 'Prepared',
  applied: 'Applied',
  replied: 'Replied',
  interview: 'Interview',
}

async function activityApps(userId: string, since: Date, kind: string, toStatus?: string): Promise<number> {
  const [row] = await db
    .select({ c: countDistinct(activities.applicationId) })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.kind, kind),
        gte(activities.createdAt, since),
        toStatus ? sql`${activities.payload}->>'to' = ${toStatus}` : undefined,
      ),
    )
  return Number(row?.c ?? 0)
}

export async function weekFunnel(userId: string, now: Date = new Date()): Promise<WeekFunnel> {
  const tz = await getUserTimeZone(userId)
  const since = weekStart(now, tz)
  const [shortlisted, prepared, appliedRow, replied, interview] = await Promise.all([
    shortlistQ.countSince(userId, localDay(since, tz)),
    prepsQ.countPreparedSince(userId, since),
    db
      .select({ c: countDistinct(applications.id) })
      .from(applications)
      .where(and(eq(applications.userId, userId), gte(applications.appliedAt, since))),
    activityApps(userId, since, 'email'),
    activityApps(userId, since, 'status_change', 'interview'),
  ])
  return { since, shortlisted, prepared, applied: Number(appliedRow[0]?.c ?? 0), replied, interview }
}
