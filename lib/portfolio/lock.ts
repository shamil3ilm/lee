import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { LOCKED_MESSAGE, profileEditableInLee } from './sync-flags'

/**
 * SERVER-ONLY. Public facts are read-only in lee while PROFILE_EDIT_IN_LEE
 * is off and the user's portfolio has been synced (lee has pulled
 * profile.json at least once). Before the first pull — no portfolio, or
 * an empty repository — lee edits work as before.
 */

/** True when this user's public facts come from the portfolio and cannot be edited in lee. */
export async function publicFactsLocked(userId: string): Promise<boolean> {
  if (profileEditableInLee()) return false
  const state = await publishQ.get(userId)
  return Boolean(state?.pulledSha)
}

/** Whether lee may add or change this user's public facts (importers, editors). */
export async function canEditPublicFacts(userId: string): Promise<boolean> {
  return !(await publicFactsLocked(userId))
}

export { publicFactsChanged, publicFactsHash } from './apply'
export { LOCKED_MESSAGE }
