import type { UserProfile } from '@/lib/db/queries/profile'
import { experienceMonths } from '@/lib/cv-score/career'
import type { ResumeProfile } from '@/lib/resume/types'
import { LANGUAGE_LEVELS, type LanguageLevel } from '../relevance/discovery-prefs'
import { searchPrefsFromProfile, type SearchPrefs } from '../relevance/prefs'
import { normalizeForMatch } from '../relevance/text'
import { readyEvidence } from './evidence'
import type { MatchProfile } from './types'

/**
 * The user's side of the Match Score, from READY evidence only (see
 * ./evidence.ts) plus the search preferences.
 */

export { EINVOICING_TERMS, PAYMENTS_TERMS } from './evidence'

export type ProfileSource = Pick<
  UserProfile,
  | 'skills'
  | 'stackWeights'
  | 'yearsExperience'
  | 'remotePref'
  | 'resume'
  | 'roleTypes'
  | 'seniorityLevels'
  | 'locationPrefs'
  | 'acceptRelocation'
  | 'willingToRelocateTo'
  | 'remoteScope'
  | 'keywords'
  | 'dealbreakers'
  | 'searchPrefsSavedAt'
  | 'discoveryPrefs'
>

const LEVEL_RANK = new Map(LANGUAGE_LEVELS.map((l, i) => [l, i] as const))

/** Whole years across résumé roles (overlaps merged), or null without dated roles. */
export function resumeYears(resume: ResumeProfile | null, now: Date): number | null {
  if (!resume) return null
  const toMonth = (d: string): string | undefined => (d ? (d.length >= 7 ? d.slice(0, 7) : `${d}-01`) : undefined)
  const roles = resume.work
    .filter((w) => w.startDate)
    .map((w) => ({ company: w.name, title: w.position, start: toMonth(w.startDate), end: toMonth(w.endDate) ?? 'present', bullets: [] }))
  if (roles.length === 0) return null
  return Math.floor(experienceMonths(roles, now) / 12)
}

function languagesOf(resume: ResumeProfile | null, prefs: SearchPrefs): Map<string, LanguageLevel> {
  const out = new Map<string, LanguageLevel>()
  const add = (name: string, level: LanguageLevel): void => {
    const key = normalizeForMatch(name)
    const prev = out.get(key)
    if (!prev || (LEVEL_RANK.get(level) ?? 0) > (LEVEL_RANK.get(prev) ?? 0)) out.set(key, level)
  }
  for (const l of resume?.languages ?? []) add(l.language, l.fluency)
  for (const l of prefs.extra.languages) add(l.name, l.level)
  return out
}

export function matchProfileFrom(profile: ProfileSource | null, now: Date = new Date()): MatchProfile {
  const prefs = searchPrefsFromProfile(profile)
  const evidence = readyEvidence(profile)
  return {
    skills: evidence.skills,
    domains: evidence.domains,
    years: profile?.yearsExperience ?? resumeYears(evidence.resume, now),
    seniority: prefs.seniority,
    roleFamilies: prefs.roleFamilies,
    customRoles: prefs.customRoles,
    regions: prefs.regions,
    otherCountries: prefs.otherCountries,
    remoteScope: prefs.remoteScope,
    remotePref: profile?.remotePref ?? 'any',
    languages: languagesOf(evidence.resume, prefs),
    extra: {
      basedIn: prefs.extra.basedIn,
      sponsorshipFor: prefs.extra.sponsorshipFor,
      payFloors: prefs.extra.payFloors,
      relocationIfSponsored: prefs.extra.relocationIfSponsored,
      relocationCountries: prefs.extra.relocationCountries,
    },
    prefsActive: prefs.active,
  }
}
