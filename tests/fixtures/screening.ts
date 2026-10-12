import type { UserProfile } from '@/lib/db/queries/profile'
import { renderedEvidence } from '@/lib/cv-fit/evidence'
import { computeMatch } from '@/lib/discovery/match/score'
import { matchProfileFrom } from '@/lib/discovery/match/profile'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { parseResumeProfile, type ResumeProfile } from '@/lib/resume/types'
import type { ScreenInput, ScreenJob } from '@/lib/screening/input'
import { renderVariant } from '@/lib/variants/render'
import { tailorProfile, tailorRecipe } from '@/tests/fixtures/resume/tailor'

/**
 * Synthetic screening inputs (no real data): the tailoring profile (PayCo
 * 2022–now, ShopCo 2019–2021, PHP/Laravel/MySQL/React/Redis ready), a
 * GCC + India search that needs sponsorship in the Gulf, and its "GCC ·
 * Backend" variant.
 */

export const SCREEN_NOW = new Date('2026-10-12T09:00:00Z')

export function screenResume(over: Record<string, unknown> = {}): ResumeProfile {
  const base = tailorProfile()
  return parseResumeProfile({ ...base, ...over })
}

export function screenUser(over: Partial<UserProfile> = {}, resume: ResumeProfile = screenResume()): UserProfile {
  return {
    headline: 'Backend developer',
    summaryMd: null,
    skills: [],
    industries: ['fintech'],
    roleTypes: ['backend', 'fullstack'],
    seniority: null,
    seniorityLevels: ['junior', 'mid'],
    yearsExperience: null,
    remotePref: 'any',
    remoteScope: 'worldwide',
    locationPrefs: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'].map((country) => ({ country, cities: [], priority: 1 })),
    acceptRelocation: false,
    willingToRelocateTo: [],
    stackWeights: {},
    mustHaves: [],
    dealbreakers: [],
    keywords: [],
    benefitPrefs: {},
    discoveryPrefs: { basedIn: 'IN', sponsorshipFor: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'], noticePeriods: ['1_month'] },
    searchPrefsSavedAt: new Date('2026-09-27T00:00:00Z'),
    resume,
    ...over,
  } as unknown as UserProfile
}

export const VARIANT_NAME = 'GCC · Backend'

export function screenVariant(resume: ResumeProfile = screenResume()): ScreenInput['variant'] {
  return { name: VARIANT_NAME, evidence: renderedEvidence(renderVariant(resume, tailorRecipe())) }
}

export interface ScreenOpts {
  user?: UserProfile
  variant?: ScreenInput['variant']
  postedAt?: Date | null
  referral?: ScreenInput['referral']
  now?: Date
}

/** A full ScreenInput for `job`, with the stored Match detail computed as ingest would. */
export function screenInput(job: ScreenJob, opts: ScreenOpts = {}): ScreenInput {
  const user = opts.user ?? screenUser()
  const now = opts.now ?? SCREEN_NOW
  const profile = matchProfileFrom(user, now)
  return {
    job,
    profile,
    resume: parseResumeProfile(user.resume),
    noticePeriods: searchPrefsFromProfile(user).extra.noticePeriods,
    detail: computeMatch(job, profile),
    variant: opts.variant === undefined ? screenVariant(parseResumeProfile(user.resume)) : opts.variant,
    postedAt: opts.postedAt ?? null,
    firstSeenAt: null,
    referral: opts.referral,
    now,
  }
}

export function gccJob(over: Partial<ScreenJob> = {}): ScreenJob {
  return {
    title: 'Backend Developer',
    companyName: 'Example Co',
    location: 'Dubai, UAE',
    remoteType: 'onsite',
    applyUrl: 'https://boards.greenhouse.io/example/jobs/1',
    techStack: [],
    descriptionMd: [
      '## Responsibilities',
      '- Build payment and reconciliation services in PHP and Laravel.',
      '## Requirements',
      '- 2+ years with PHP and Laravel.',
      '- Experience with MySQL and Redis.',
      '- Experience with payment webhooks.',
      '## Benefits',
      '- Employment visa, medical insurance and annual air ticket provided.',
    ].join('\n'),
    ...over,
  }
}
