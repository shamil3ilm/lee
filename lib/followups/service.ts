import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, applications, documents } from '@/lib/db/schema'

/**
 * v4.2 — follow-up nudges.
 *
 * At each cron tick we look for applications that:
 *   1. have `appliedAt` set
 *   2. are still in-flight (status in 'applied' or 'screen' — not interview,
 *      offer, rejected, or withdrawn; those need different handling)
 *   3. crossed one of the canonical 7/14/21/30-day marks since appliedAt
 *   4. have no follow-up email drafted yet for THAT interval
 *   5. have no inbound email activity in the last 3 days (a live conversation
 *      trumps a nudge)
 *
 * The candidate carries the *suggested* interval (the highest bucket already
 * passed) so the UI can jump straight to the right quick-action button.
 */

export const FOLLOWUP_INTERVALS = [7, 14, 21, 30] as const
export type FollowupInterval = (typeof FOLLOWUP_INTERVALS)[number]

// Statuses where a follow-up nudge still makes sense. Once you're in the
// interview loop the conversation has its own cadence; rejected/withdrawn
// obviously don't need chasing.
const ACTIVE_STATUSES = ['applied', 'screen'] as const

const MS_PER_DAY = 24 * 60 * 60 * 1000
const RECENT_EMAIL_LOOKBACK_MS = 3 * MS_PER_DAY

export interface FollowupCandidate {
  applicationId: string
  jobTitle: string
  companyName: string | null
  daysSince: number
  suggestedInterval: FollowupInterval
}

function bucketFor(daysSince: number): FollowupInterval | null {
  // Highest crossed threshold wins so day 30+ gets the "close the loop"
  // framing, not another day-7 check-in.
  if (daysSince >= 30) return 30
  if (daysSince >= 21) return 21
  if (daysSince >= 14) return 14
  if (daysSince >= 7) return 7
  return null
}

/**
 * Returns applications that deserve a follow-up nudge right now. Read-only —
 * the caller (cron) is responsible for logging activities.
 */
export async function findFollowupCandidates(
  userId: string,
  now: Date = new Date(),
): Promise<FollowupCandidate[]> {
  // Pull all in-flight applications, do the interval math in memory, then
  // check drafts and live email threads for all due apps in two batched
  // queries — three queries total regardless of how many apps are due.
  const rows = await db.query.applications.findMany({
    where: and(
      eq(applications.userId, userId),
      inArray(applications.status, ACTIVE_STATUSES as unknown as string[]),
    ),
    with: { job: { with: { company: true } } },
  })

  const due = rows.flatMap((app) => {
    if (!app.appliedAt) return []
    const daysSince = Math.floor((now.getTime() - app.appliedAt.getTime()) / MS_PER_DAY)
    const suggested = bucketFor(daysSince)
    return suggested ? [{ app, daysSince, suggested }] : []
  })
  if (due.length === 0) return []
  const appIds = due.map((d) => d.app.id)

  // Two batched lookups instead of two queries per application.
  const [draftedDays, liveThreads] = await Promise.all([
    draftedFollowupDays(userId, appIds),
    appsWithRecentEmail(userId, appIds, new Date(now.getTime() - RECENT_EMAIL_LOOKBACK_MS)),
  ])

  return due
    // A drafted follow-up for this specific interval means the user is
    // already handling this bucket — don't re-nudge.
    .filter((d) => !(draftedDays.get(d.app.id) ?? []).includes(d.suggested))
    // Skip if there's a live inbound conversation (`kind='email'` is
    // written by the Gmail sync when a matched thread lands in the app).
    .filter((d) => !liveThreads.has(d.app.id))
    .map((d) => ({
      applicationId: d.app.id,
      jobTitle: d.app.job.title,
      companyName: d.app.job.company?.name ?? null,
      daysSince: d.daysSince,
      suggestedInterval: d.suggested,
    }))
}

/**
 * `daysSince` values of every follow-up draft per application, in one
 * grouped query. Only that JSON field is read — never the document body.
 */
async function draftedFollowupDays(
  userId: string,
  appIds: readonly string[],
): Promise<Map<string, unknown[]>> {
  const rows = await db
    .select({
      applicationId: documents.applicationId,
      days: sql<unknown[]>`jsonb_agg(distinct ${documents.content} -> 'daysSince')`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.userId, userId),
        eq(documents.kind, 'outreach_followup_email'),
        inArray(documents.applicationId, [...appIds]),
      ),
    )
    .groupBy(documents.applicationId)
  return new Map(
    rows.flatMap((r) => (r.applicationId ? [[r.applicationId, parseJsonArray(r.days)] as const] : [])),
  )
}

function parseJsonArray(v: unknown): unknown[] {
  // postgres-js parses jsonb; some drivers hand back the JSON text.
  const parsed = typeof v === 'string' ? (JSON.parse(v) as unknown) : v
  return Array.isArray(parsed) ? parsed : []
}

/** Applications with an inbound email activity since `since`, in one query. */
async function appsWithRecentEmail(
  userId: string,
  appIds: readonly string[],
  since: Date,
): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ applicationId: activities.applicationId })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.kind, 'email'),
        inArray(activities.applicationId, [...appIds]),
        gte(activities.createdAt, since),
      ),
    )
  return new Set(rows.map((r) => r.applicationId))
}

/** Of `appIds`, those that already got a `followup_recommended` in the last 24 h. */
export async function recentlyNudgedIds(
  userId: string,
  appIds: readonly string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (appIds.length === 0) return new Set()
  const rows = await db
    .selectDistinct({ applicationId: activities.applicationId })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.kind, 'followup_recommended'),
        inArray(activities.applicationId, [...appIds]),
        gte(activities.createdAt, new Date(now.getTime() - MS_PER_DAY)),
      ),
    )
  return new Set(rows.map((r) => r.applicationId))
}

/**
 * Cron step: emit one `followup_recommended` activity per candidate that
 * was not nudged in the last 24 h. One candidate lookup, one "already
 * nudged" query for all candidates, one multi-row insert. Returns the number
 * of nudges written.
 */
export async function recordFollowupNudges(userId: string, now: Date = new Date()): Promise<number> {
  const candidates = await findFollowupCandidates(userId, now)
  if (candidates.length === 0) return 0
  const nudged = await recentlyNudgedIds(
    userId,
    candidates.map((c) => c.applicationId),
    now,
  )
  const toNudge = candidates.filter((c) => !nudged.has(c.applicationId))
  if (toNudge.length === 0) return 0
  await db.insert(activities).values(
    toNudge.map((c) => ({
      userId,
      applicationId: c.applicationId,
      kind: 'followup_recommended',
      payload: { daysSince: c.daysSince, suggestedInterval: c.suggestedInterval },
    })),
  )
  return toNudge.length
}

/**
 * Idempotency guard for the cron sweep: within a 24h window, don't emit the
 * same `followup_recommended` activity twice for the same application. We key
 * ONLY on applicationId (not interval) because the user only needs one nudge
 * per app per day even if they cross the 14→21 boundary overnight.
 */
export async function alreadyNudgedRecently(
  userId: string,
  applicationId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [row] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.applicationId, applicationId),
        eq(activities.kind, 'followup_recommended'),
        gte(activities.createdAt, new Date(now.getTime() - MS_PER_DAY)),
      ),
    )
    .orderBy(desc(activities.createdAt))
    .limit(1)
  return row !== undefined
}
