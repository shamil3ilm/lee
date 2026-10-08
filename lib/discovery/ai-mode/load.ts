import type { UserProfile } from '@/lib/db/queries/profile'
import * as profileQ from '@/lib/db/queries/profile'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { readStoredProfile } from '@/lib/resume/service'
import { dailyPromptSet, type DailyPromptSet } from './daily'
import { piiTermsFromProfile } from './pii'

export type AiModePromptSet = DailyPromptSet

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
  return dailyPromptSet(searchPrefsFromProfile(profile), opts.now ?? new Date(), {
    piiTerms: piiTermsFromProfile(resume),
  })
}
