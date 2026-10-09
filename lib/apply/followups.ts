import * as appsQ from '@/lib/db/queries/applications'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import * as profileQ from '@/lib/db/queries/profile'
import { cadenceFor, isGccAgencyPosting } from '@/lib/followups/cadence'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { followupDue } from './dates'
import { applySettingsFrom } from './settings'

/**
 * Follow-up nudges scheduled by "Mark applied". lee only reminds and drafts
 * (the existing follow-up outreach prompt); the user sends the email
 * themselves. A Gmail-matched reply cancels the pending nudge.
 */

/** Gmail sync matched an email to this application: the nudge is no longer needed. */
export function cancelOnReply(userId: string, applicationId: string, now: Date = new Date()): Promise<number> {
  return prepsQ.closeFollowup(userId, applicationId, 'cancelled', now)
}

/**
 * The user followed up (or chose not to). After the check-in the nudge moves
 * to the final note (the second mark); after that it closes: two notes, then
 * stop (lib/followups/cadence.ts).
 */
export async function completeFollowup(userId: string, applicationId: string, now: Date = new Date()): Promise<number> {
  const next = await secondNudgeAt(userId, applicationId)
  if (next) {
    await prepsQ.save(userId, applicationId, { followupDueAt: next, followupStatus: 'pending' })
    return 1
  }
  return prepsQ.closeFollowup(userId, applicationId, 'done', now)
}

/** When the pending nudge is the check-in, the instant of the final note; else null. */
async function secondNudgeAt(userId: string, applicationId: string): Promise<Date | null> {
  const prep = await prepsQ.get(userId, applicationId)
  if (!prep || prep.followupStatus !== 'pending' || !prep.appliedAt || !prep.followupDueAt) return null
  const [app, tz, profile] = await Promise.all([appsQ.getById(userId, applicationId), getUserTimeZone(userId), profileQ.get(userId)])
  if (!app) return null
  const marks = cadenceFor(
    applySettingsFrom(profile),
    isGccAgencyPosting({ title: app.job.title, location: app.job.location, companyName: app.job.company?.name ?? null, descriptionMd: app.job.descriptionMd }),
  )
  const second = followupDue(prep.appliedAt, marks.second, tz)
  return prep.followupDueAt.getTime() < second.getTime() ? second : null
}

/** Pending nudges that are due now. */
export function dueFollowups(userId: string, now: Date = new Date(), limit = 10): Promise<prepsQ.DueFollowup[]> {
  return prepsQ.listDue(userId, now, limit)
}
