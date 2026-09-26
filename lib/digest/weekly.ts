import { and, asc, eq, gte, isNotNull, lt, lte, notInArray, desc, sql } from 'drizzle-orm'
import { discoveryNotQuarantinedSql } from '@/lib/db/queries/riskAssessments'
import { db, type DbClient } from '@/lib/db/client'
import {
  applications,
  companies,
  discoveries,
  documents,
  interviewStages,
  jobs,
  todos,
  users,
} from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import { sendEmail as defaultSendEmail } from '@/lib/gmail/send'
import { renderWeeklyDigestHtml } from './email-template'
import { logger } from '@/lib/logger'
import { APP_NAME } from '@/lib/brand'
import {
  DEFAULT_TIMEZONE,
  isMondayInTz as isMondayInTzHelper,
  sentThisTzWeek,
} from '@/lib/ui/timezone'
import { todoIsActiveSql } from '@/lib/db/queries/todos'

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
  // v4.3 — interview stages whose status flipped to 'completed' within the
  // past 7 days. `hasDebrief` / `hasAIDebrief` let the email nudge the user
  // to reflect while the interview is still fresh.
  completedStagesThisWeek: {
    stageId: string
    stageKind: string
    stageTitle: string | null
    updatedAt: Date
    jobTitle: string
    companyName: string | null
    applicationId: string
    hasDebrief: boolean
    hasAIDebrief: boolean
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
    .where(
      and(eq(discoveries.userId, userId), eq(discoveries.status, 'new'), discoveryNotQuarantinedSql()),
    )
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
        todoIsActiveSql(),
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

  // v4.3 — completed stages in the trailing 7 days. Match completion by
  // updated_at because there is no dedicated `completed_at` column; a stage
  // whose status is now 'completed' and whose updated_at is within the window
  // is treated as freshly closed. Not perfect (any subsequent edit re-stamps
  // updated_at), but good enough for a nudge digest and cheaper than adding
  // a schema change.
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS)
  const completedRows = await client
    .select({
      stageId: interviewStages.id,
      stageKind: interviewStages.kind,
      stageTitle: interviewStages.title,
      debriefNotesMd: interviewStages.debriefNotesMd,
      updatedAt: interviewStages.updatedAt,
      applicationId: applications.id,
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
        eq(interviewStages.status, 'completed'),
        gte(interviewStages.updatedAt, sevenDaysAgo),
      ),
    )
    .orderBy(desc(interviewStages.updatedAt))
    .limit(20)

  // Second pass: does the user have an interview_debrief document per stage?
  // Loading all recent debriefs once and matching by content.stageId keeps
  // this to two queries rather than N.
  const stageIds = completedRows.map((r) => r.stageId)
  const debriefStageIdSet = new Set<string>()
  if (stageIds.length > 0) {
    const debriefRows = await client
      .select({ content: documents.content })
      .from(documents)
      .where(and(eq(documents.userId, userId), eq(documents.kind, 'interview_debrief')))
    for (const row of debriefRows) {
      const c = row.content as { stageId?: string } | null
      if (c && typeof c.stageId === 'string') debriefStageIdSet.add(c.stageId)
    }
  }

  const completedStagesThisWeek = completedRows.map((r) => ({
    stageId: r.stageId,
    stageKind: r.stageKind,
    stageTitle: r.stageTitle,
    updatedAt: r.updatedAt,
    jobTitle: r.jobTitle,
    companyName: r.companyName,
    applicationId: r.applicationId,
    hasDebrief: Boolean(r.debriefNotesMd && r.debriefNotesMd.trim().length > 0),
    hasAIDebrief: debriefStageIdSet.has(r.stageId),
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
    completedStagesThisWeek,
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
 * Two PipelineSnapshots are "materially the same" for send-time purposes when
 * every send-relevant scalar is unchanged. We keep this narrow — no
 * per-list-item comparison — because the goal is "did the numbers move
 * between gather and send" not "audit every field."
 */
function digestFingerprint(snap: PipelineSnapshot): string {
  return JSON.stringify({
    total: snap.totalApplications,
    byStatus: [...snap.applicationsByStatus].sort((a, b) => a.status.localeCompare(b.status)),
    interviews: snap.upcomingInterviews.length,
    interviewIds: [...snap.upcomingInterviews.map((s) => s.stageId)].sort(),
    discoveries: snap.topDiscoveries.length,
    discoveryIds: [...snap.topDiscoveries.map((d) => d.id)].sort(),
    stale: snap.staleApplications.length,
    todos: snap.upcomingTodos.length,
    completed: snap.completedStagesThisWeek.length,
  })
}

/**
 * v9 late-check: re-gather right before send and, if the numbers changed,
 * re-render so the email reflects live state at delivery — not the state
 * at cron-fire time. The window is small in practice (milliseconds), but
 * covers the common case of a status flip landing between the daily
 * pre-send batch and the actual SMTP send.
 */
export async function gatherAndCompareSnapshot(
  userId: string,
  previous: PipelineSnapshot,
): Promise<{ snapshot: PipelineSnapshot; changed: boolean }> {
  const snapshot = await gatherPipelineSnapshot(userId)
  const changed = digestFingerprint(snapshot) !== digestFingerprint(previous)
  return { snapshot, changed }
}

/**
 * Build and send the weekly digest for `userId`. On success updates
 * `digestLastSentAt` so `alreadySentThisWeek` blocks a subsequent same-week
 * send. Throws on failure so the caller can log & count.
 *
 * v9 — re-snapshot immediately before the send call so email content
 * reflects live state at delivery rather than at gather time.
 */
export async function sendWeeklyDigest(args: SendWeeklyDigestArgs): Promise<{
  messageId: string
  snapshot: PipelineSnapshot
}> {
  const send = args.sendEmail ?? defaultSendEmail
  let snapshot = await gatherPipelineSnapshot(args.userId)
  let htmlBody = renderWeeklyDigestHtml(snapshot)

  // Re-snapshot right before send. On drift, re-render — cheaper than
  // shipping stale numbers to the user's inbox.
  const compared = await gatherAndCompareSnapshot(args.userId, snapshot)
  if (compared.changed) {
    snapshot = compared.snapshot
    htmlBody = renderWeeklyDigestHtml(snapshot)
    logger.info('weekly_digest_re_rendered_on_drift', { userId: args.userId })
  }

  const subject = `${APP_NAME} · weekly · ${snapshot.totalApplications} apps, ${snapshot.upcomingInterviews.length} interviews this week`
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
