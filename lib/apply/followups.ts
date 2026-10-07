import * as prepsQ from '@/lib/db/queries/applicationPreps'

/**
 * Follow-up nudges scheduled by "Mark applied". lee only reminds and drafts
 * (the existing follow-up outreach prompt); the user sends the email
 * themselves. A Gmail-matched reply cancels the pending nudge.
 */

/** Gmail sync matched an email to this application: the nudge is no longer needed. */
export function cancelOnReply(userId: string, applicationId: string, now: Date = new Date()): Promise<number> {
  return prepsQ.closeFollowup(userId, applicationId, 'cancelled', now)
}

/** The user followed up (or chose not to): close the nudge. */
export function completeFollowup(userId: string, applicationId: string, now: Date = new Date()): Promise<number> {
  return prepsQ.closeFollowup(userId, applicationId, 'done', now)
}

/** Pending nudges that are due now. */
export function dueFollowups(userId: string, now: Date = new Date(), limit = 10): Promise<prepsQ.DueFollowup[]> {
  return prepsQ.listDue(userId, now, limit)
}
