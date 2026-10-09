import type { UserProfile } from '@/lib/db/queries/profile'
import * as profileQ from '@/lib/db/queries/profile'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { readStoredProfile } from '@/lib/resume/service'
import { dailyPromptSet, type DailyPromptSet } from './daily'
import { piiTermsFromProfile } from './pii'
import { buildHiringPostPrompts } from './hiring-posts'
import type { AiModePrompt } from './prompts'

export type AiModePromptSet = DailyPromptSet & {
  /** Prompts for LinkedIn hiring posts (always shown, not in the daily rotation). */
  posts: AiModePrompt[]
}

/**
 * The AI Mode dialog's prompts for this user: from the search preferences,
 * scrubbed against the master profile's identifiers (name, email, phone,
 * employers, schools), which are read here and never returned.
 */
export async function loadAiModePrompts(
  userId: string,
  opts: { profile?: UserProfile | null; now?: Date } = {},
): Promise<AiModePromptSet> {
  const profile = opts.profile !== undefined ? opts.profile : await profileQ.get(userId)
  const resume = await readStoredProfile(userId, profile).catch(() => null)
  const prefs = searchPrefsFromProfile(profile)
  const piiTerms = piiTermsFromProfile(resume)
  return {
    ...dailyPromptSet(prefs, opts.now ?? new Date(), { piiTerms }),
    posts: buildHiringPostPrompts(prefs, piiTerms),
  }
}
