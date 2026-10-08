import type { MatchJob, MatchProfile } from '@/lib/discovery/match/types'
import { withImplied } from '@/lib/discovery/match/lexicon'

/** A generic junior–mid backend profile targeting the GCC and India (no personal data). */
export function matchProfile(over: Partial<MatchProfile> = {}): MatchProfile {
  return {
    skills: withImplied(['laravel', 'mysql', 'rest', 'git', 'docker']),
    domains: new Set(['payments']),
    years: 2,
    seniority: ['junior', 'mid'],
    roleFamilies: ['backend', 'fullstack'],
    customRoles: [],
    regions: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'],
    otherCountries: [],
    remoteScope: 'worldwide',
    remotePref: 'any',
    languages: new Map([['english', 'fluent']]),
    extra: {
      basedIn: 'IN',
      sponsorshipFor: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
      payFloors: [],
      relocationIfSponsored: true,
      relocationCountries: [],
    },
    prefsActive: true,
    ...over,
  }
}

export function matchJob(over: Partial<MatchJob> = {}): MatchJob {
  return {
    title: 'Backend Developer',
    location: 'Dubai, United Arab Emirates',
    remoteType: 'onsite',
    descriptionMd: '',
    techStack: [],
    employmentType: 'fulltime',
    salary: null,
    ...over,
  }
}
