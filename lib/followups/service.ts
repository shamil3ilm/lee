import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, applications, documents, userProfile } from '@/lib/db/schema'
import { applySettingsFrom } from '@/lib/apply/settings'
import { businessDaysBetween, cadenceFor, isGccAgencyPosting, stepDue, stepOfDraft, type FollowupStep } from './cadence'

/**
 * Follow-up nudges (cadence: lib/followups/cadence.ts).
 *
 * At each cron tick we look for applications that:
 *   1. have `appliedAt` set
 *   2. are still in-flight (status 'applied' or 'screen'; interview, offer,
 *      rejected and withdrawn have their own cadence or need none)
 *   3. crossed a follow-up mark in BUSINESS days since appliedAt: step 1
 *      (default 5; 3 for a GCC posting through an agency), step 2 (default
 *      10), then nothing more
 *   4. have no follow-up drafted yet for that step (or a later one)
 *   5. have no inbound email activity in the last 3 days (a live conversation
 *      trumps a nudge)
 *
 * The candidate carries the step due so the UI can draft the right note.
 */

// Statuses where a follow-up nudge still makes sense.
// 'speculative': a note sent to a company with no open role (same cadence).
const ACTIVE_STATUSES = ['speculative', 'applied', 'screen'] as const

const MS_PER_DAY = 24 * 60 * 60 * 1000
const RECENT_EMAIL_LOOKBACK_MS = 3 * MS_PER_DAY

export interface FollowupCandidate {
  applicationId: string
  jobTitle: string
  companyName: string | null
  /** Business days since applying. */
  daysSince: number
  step: FollowupStep
}

/**
 * Returns applications that deserve a follow-up nudge right now. Read-only —
 * the caller (cron) is responsible for logging activities.
 */
export async function findFollowupCandidates(
  userId: string,
  now: Date = new Date(),
): Promise<FollowupCandidate[]> {
  // Pull all in-flight applications (and the user's cadence), do the math in
  // memory, then check drafts and live email threads for all due apps in two
  // batched queries — four queries total regardless of how many apps are due.
  const [rows, profile] = await Promise.all([
    db.query.applications.findMany({
      where: and(
        eq(applications.userId, userId),
        inArray(applications.status, ACTIVE_STATUSES as unknown as string[]),
      ),
      with: { job: { with: { company: true } } },
    }),
    db.query.userProfile.findFirst({
      where: eq(userProfile.userId, userId),
      columns: { followupDays: true, followupSecondDays: true },
    }),
  ])
  const settings = applySettingsFrom(profile)

  const due = rows.flatMap((app) => {
    if (!app.appliedAt) return []
    const daysSince = businessDaysBetween(app.appliedAt, now)
    const gccAgency = isGccAgencyPosting({
      title: app.job.title,
      location: app.job.location,
      companyName: app.job.company?.name ?? null,
      descriptionMd: app.job.descriptionMd,
    })
    const step = stepDue(daysSince, cadenceFor(settings, gccAgency))
    return step ? [{ app, daysSince, step }] : []
  })
  if (due.length === 0) return []
  const appIds = due.map((d) => d.app.id)

  // Two batched lookups instead of two queries per application.
  const [draftedSteps, liveThreads] = await Promise.all([
    draftedFollowupSteps(userId, appIds),
    appsWithRecentEmail(userId, appIds, new Date(now.getTime() - RECENT_EMAIL_LOOKBACK_MS)),
  ])

  return due
    // A follow-up drafted for this step (or the final one) means the user is
    // already handling it; after step 2 lee stops.
    .filter((d) => !(draftedSteps.get(d.app.id) ?? []).some((s) => s >= d.step))
    // Skip if there's a live inbound conversation (`kind='email'` is
    // written by the Gmail sync when a matched thread lands in the app).
    .filter((d) => !liveThreads.has(d.app.id))
    .map((d) => ({
      applicationId: d.app.id,
      jobTitle: d.app.job.title,
      companyName: d.app.job.company?.name ?? null,
      daysSince: d.daysSince,
      step: d.step,
    }))
}

/**
 * The follow-up steps already drafted per application, in one grouped
 * query. Only the step and days fields are read — never the document body.
 */
async function draftedFollowupSteps(
  userId: string,
  appIds: readonly string[],
): Promise<Map<string, FollowupStep[]>> {
  const rows = await db
    .select({
      applicationId: documents.applicationId,
      drafts: sql<unknown[]>`jsonb_agg(jsonb_build_object('followupStep', ${documents.content} -> 'followupStep', 'daysSince', ${documents.content} -> 'daysSince'))`,
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
  const stepsOf = (v: unknown): FollowupStep[] =>
    parseJsonArray(v).flatMap((d) => {
      const step = d && typeof d === 'object' ? stepOfDraft(d as Record<string, unknown>) : null
      return step ? [step] : []
    })
  return new Map(rows.flatMap((r) => (r.applicationId ? [[r.applicationId, stepsOf(r.drafts)] as const] : [])))
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
      payload: { daysSince: c.daysSince, step: c.step },
    })),
  )
  return toNudge.length
}

/**
 * Idempotency guard for the cron sweep: within a 24h window, don't emit the
 * same `followup_recommended` activity twice for the same application. We key
 * ONLY on applicationId (not step) because the user only needs one nudge
 * per app per day.
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
