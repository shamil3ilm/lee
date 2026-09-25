import { and, asc, eq, gte, isNotNull, lt, lte, notInArray, desc, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import {
  applications,
  companies,
  discoveries,
  interviewStages,
  jobs,
  todos,
  users,
} from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import { sendEmail as defaultSendEmail } from '@/lib/gmail/send'
import { renderWeeklyDigestHtml } from './email-template'
import { logger } from '@/lib/logger'
import {
  DEFAULT_TIMEZONE,
  isMondayInTz as isMondayInTzHelper,
  sentThisTzWeek,
} from '@/lib/ui/timezone'

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
  // v8 — open todos due within the next 7 days (inclusive of overdue). Sorted
  // by dueAt ascending so the earliest items appear first in the email.
  upcomingTodos: {
    id: string
    title: string
    dueAt: Date | null
    priority: number
    applicationId: string | null
  }[]
}

// ---------------------------------------------------------------------------
// Date guards
// ---------------------------------------------------------------------------

/**
 * True if the current UTC day-of-week is Monday. Kept for backwards-compat
 * with tests + any caller that hasn't been threaded through user tz. New
 * code should call `isMondayInTz` with the user's stored timezone.
 */
export function isMondayUtc(now: Date = new Date()): boolean {
  return now.getUTCDay() === 1
}

/**
 * True if `now` is Monday when interpreted in the user's stored tz. When no
 * tz is provided we fall back to the default (Asia/Dubai) — same behavior as
 * pre-v4.1.
 */
export function isMondayInTz(tz: string | null | undefined, now: Date = new Date()): boolean {
  return isMondayInTzHelper(tz ?? DEFAULT_TIMEZONE, now)
}

/**
 * True if `digestLastSentAt` falls within the current UTC week (Monday
 * 00:00:00 UTC through Sunday 23:59:59.999 UTC). Prevents a double-send if
 * the cron misfires twice on the same Monday. Kept for backwards-compat;
 * new call sites should use `alreadySentThisTzWeek` with the user's tz.
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

/**
 * Timezone-aware sibling of `alreadySentThisWeek` — uses Monday-local as the
 * week boundary so a user in Asia/Dubai (UTC+4) doesn't double-receive on
 * their Sunday evening when the cron fires just past UTC midnight.
 */
export function alreadySentThisTzWeek(
  profile: Pick<profileQ.UserProfile, 'digestLastSentAt'> | null,
  tz: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return sentThisTzWeek(profile?.digestLastSentAt ?? null, tz ?? DEFAULT_TIMEZONE, now)
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

  // v8 — upcoming todos: open, due within the next 7 days (or already
  // overdue). Cap at 15 to avoid a wall-of-text digest.
  const todoRows = await client
    .select({
      id: todos.id,
      title: todos.title,
      dueAt: todos.dueAt,
      priority: todos.priority,
      applicationId: todos.applicationId,
    })
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.status, 'open'),
        isNotNull(todos.dueAt),
        lte(todos.dueAt, in7),
      ),
    )
    .orderBy(asc(todos.dueAt))
    .limit(15)
  const upcomingTodos = todoRows
    .filter((r) => r.dueAt !== null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      dueAt: r.dueAt as Date,
      priority: r.priority,
      applicationId: r.applicationId,
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
    upcomingTodos,
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
