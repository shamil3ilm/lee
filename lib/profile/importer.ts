import type { AIProvider } from '@/lib/ai'
import type { NewUserProfile, UserProfile } from '@/lib/db/queries/profile'
import { saveProfile } from './service'

export interface ImportProfileArgs {
  userId: string
  cvText?: string
  profileMd?: string
  ai: AIProvider
}

/**
 * Parse a CV / profile markdown blob through the AI provider and persist the
 * result via `saveProfile`. First-time saves get the default location/benefit
 * seeds applied by `saveProfile`.
 */
export async function importProfile(args: ImportProfileArgs): Promise<UserProfile> {
  const { userId, cvText, profileMd, ai } = args
  const parsed = await ai.parseProfile({ cvText, profileMd })

  const patch: Partial<NewUserProfile> = {
    headline: parsed.headline ?? null,
    summaryMd: parsed.summary_md ?? null,
    skills: parsed.skills,
    industries: parsed.industries,
    roleTypes: parsed.role_types,
    seniority: parsed.seniority ?? null,
    yearsExperience: parsed.years_experience ?? null,
    stackWeights: parsed.stack_weights,
  }

  return saveProfile(userId, patch)
}
