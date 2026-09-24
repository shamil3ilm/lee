import { and, eq, gte, isNotNull, lt, notInArray, desc, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import {
  applications,
  companies,
  discoveries,
  interviewStages,
  jobs,
  users,
} from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import { sendEmail as defaultSendEmail } from '@/lib/gmail/send'
import { renderWeeklyDigestHtml } from './email-template'
import { logger } from '@/lib/logger'

const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Pipeline snapshot shape
// ---------------------------------------------------------------------------

export interface PipelineSnapshot {
  userId: string
  userEmail: string
  applicationsByStatus: { status: string; count: number }[]
  totalApplications: number
  upcomingInterviews: {
    stageId: string
    stageKind: string
    scheduledAt: Date
    title: string | null
    jobTitle: string
    companyName: string | null
  }[]
  topDiscoveries: {
    id: string
    title: string
    companyName: string | null
    matchScore: number | null
  }[]
  staleApplications: {
    id: string
    jobTitle: string
    companyName: string | null
    nextActionAt: Date
  }[]
}

// ---------------------------------------------------------------------------
// Date guards
// ---------------------------------------------------------------------------

/**
 * True if the current UTC day-of-week is Monday. The digest cron runs daily;
 * this narrows sends to Monday only. Uses UTC so behavior does not shift by
 * server region.
 */
export function isMondayUtc(now: Date = new Date()): boolean {
  return now.getUTCDay() === 1
}

/**
 * True if `digestLastSentAt` falls within the current UTC week (Monday
 * 00:00:00 UTC through Sunday 23:59:59.999 UTC). Prevents a double-send if
 * the cron misfires twice on the same Monday.
 */
export function alreadySentThisWeek(
  profile: Pick<profileQ.UserProfile, 'digestLastSentAt'> | null,
  now: Date = new Date(),
): boolean {
  if (!profile?.digestLastSentAt) return false
  const dow = now.getUTCDay() // 0=Sun ... 6=Sat
  // Distance back to Monday. Sunday (0) → 6 days back; other days → dow-1.
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - daysSinceMonday)
  monday.setUTCHours(0, 0, 0, 0)
  return profile.digestLastSentAt.getTime() >= monday.getTime()
}

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------

/**
 * Gather the data the weekly digest needs for `userId`:
 *   - applications grouped by status (ordered)
 *   - interviews scheduled within the next 7 days
 *   - top 5 discoveries by matchScore (status=new)
 *   - applications whose next_action_at is older than 14 days and are not
 *     terminal (rejected/withdrawn)
 */
export async function gatherPipelineSnapshot(
  userId: string,
  client: DbClient = db,
): Promise<PipelineSnapshot> {
  const user = await client.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw new Error(`gatherPipelineSnapshot: user ${userId} not found`)

  const statusRows = await client
    .select({
      status: applications.status,
      count: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.status)

  const totalApplications = statusRows.reduce((s, r) => s + Number(r.count), 0)

  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * DAY_MS)
  const stageRows = await client
    .select({
      stageId: interviewStages.id,
      stageKind: interviewStages.kind,
      scheduledAt: interviewStages.scheduledAt,
      title: interviewStages.title,
      jobTitle: jobs.title,
      companyName: companies.name,
    })
    .from(interviewStages)
    .innerJoin(applications, eq(interviewStages.applicationId, applications.id))
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(
      and(
        eq(interviewStages.userId, userId),
        isNotNull(interviewStages.scheduledAt),
        gte(interviewStages.scheduledAt, now),
        lt(interviewStages.scheduledAt, in7),
      ),
    )
    .orderBy(interviewStages.scheduledAt)

  const upcomingInterviews = stageRows
    .filter((r) => r.scheduledAt !== null)
    .map((r) => ({
      stageId: r.stageId,
      stageKind: r.stageKind,
      scheduledAt: r.scheduledAt as Date,
      title: r.title,
      jobTitle: r.jobTitle,
      companyName: r.companyName,
    }))

  const topDiscoveryRows = await client
    .select({
      id: discoveries.id,
      normalized: discoveries.normalized,
      matchScore: discoveries.matchScore,
    })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), eq(discoveries.status, 'new')))
    .orderBy(desc(discoveries.matchScore))
    .limit(5)

  const topDiscoveries = topDiscoveryRows.map((r) => {
    const n = (r.normalized ?? {}) as {
      title?: string
      companyName?: string
      company?: { name?: string }
    }
    return {
      id: r.id,
      title: n.title ?? 'Untitled role',
      companyName: n.companyName ?? n.company?.name ?? null,
      matchScore: r.matchScore,
    }
  })

  const staleCutoff = new Date(now.getTime() - 14 * DAY_MS)
  const staleRows = await client
    .select({
      id: applications.id,
      nextActionAt: applications.nextActionAt,
      jobTitle: jobs.title,
      companyName: companies.name,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(
      and(
        eq(applications.userId, userId),
        isNotNull(applications.nextActionAt),
        lt(applications.nextActionAt, staleCutoff),
        notInArray(applications.status, ['rejected', 'withdrawn']),
      ),
    )
    .orderBy(applications.nextActionAt)
    .limit(10)

  const staleApplications = staleRows
    .filter((r) => r.nextActionAt !== null)
    .map((r) => ({
      id: r.id,
      jobTitle: r.jobTitle,
      companyName: r.companyName,
      nextActionAt: r.nextActionAt as Date,
    }))

  return {
    userId,
    userEmail: user.email,
    applicationsByStatus: statusRows.map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
    totalApplications,
    upcomingInterviews,
    topDiscoveries,
    staleApplications,
  }
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export interface SendWeeklyDigestArgs {
  userId: string
  sendEmail?: typeof defaultSendEmail
  now?: Date
}

/**
 * Build and send the weekly digest for `userId`. On success updates
 * `digestLastSentAt` so `alreadySentThisWeek` blocks a subsequent same-week
 * send. Throws on failure so the caller can log & count.
 */
export async function sendWeeklyDigest(args: SendWeeklyDigestArgs): Promise<{
  messageId: string
  snapshot: PipelineSnapshot
}> {
  const send = args.sendEmail ?? defaultSendEmail
  const snapshot = await gatherPipelineSnapshot(args.userId)
  const subject = `Employ · weekly · ${snapshot.totalApplications} apps, ${snapshot.upcomingInterviews.length} interviews this week`
  const htmlBody = renderWeeklyDigestHtml(snapshot)
  const result = await send({
    userId: args.userId,
    to: snapshot.userEmail,
    subject,
    htmlBody,
  })
  await profileQ.upsert(args.userId, { digestLastSentAt: args.now ?? new Date() })
  logger.info('weekly_digest_sent', {
    userId: args.userId,
    messageId: result.messageId,
    apps: snapshot.totalApplications,
    interviews: snapshot.upcomingInterviews.length,
  })
  return { messageId: result.messageId, snapshot }
}
