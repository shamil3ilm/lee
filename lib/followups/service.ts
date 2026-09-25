import { and, desc, eq, gte, inArray } from 'drizzle-orm'
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
  // Pull all in-flight applications with appliedAt set. We do the interval
  // math + doc/email dedup in-memory: cardinality per user is tiny (< a few
  // hundred at most) and this avoids four subqueries per app.
  const rows = await db.query.applications.findMany({
    where: and(
      eq(applications.userId, userId),
      inArray(applications.status, ACTIVE_STATUSES as unknown as string[]),
    ),
    with: { job: { with: { company: true } } },
  })

  const candidates: FollowupCandidate[] = []
  for (const app of rows) {
    if (!app.appliedAt) continue
    const daysSince = Math.floor((now.getTime() - app.appliedAt.getTime()) / MS_PER_DAY)
    const suggested = bucketFor(daysSince)
    if (!suggested) continue

    // A drafted follow-up for this specific interval means the user is
    // already handling this bucket — don't re-nudge.
    const existingDocs = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.userId, userId),
          eq(documents.applicationId, app.id),
          eq(documents.kind, 'outreach_followup_email'),
        ),
      )
    const bucketAlreadyDrafted = existingDocs.some((d) => {
      const c = d.content as { daysSince?: number } | null
      return c?.daysSince === suggested
    })
    if (bucketAlreadyDrafted) continue

    // Skip if there's a live inbound conversation. `kind='email'` is written
    // by the Gmail sync when a matched thread lands in the app.
    const recentEmails = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.applicationId, app.id),
          eq(activities.kind, 'email'),
          gte(activities.createdAt, new Date(now.getTime() - RECENT_EMAIL_LOOKBACK_MS)),
        ),
      )
      .limit(1)
    if (recentEmails.length > 0) continue

    candidates.push({
      applicationId: app.id,
      jobTitle: app.job.title,
      companyName: app.job.company?.name ?? null,
      daysSince,
      suggestedInterval: suggested,
    })
  }
  return candidates
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
