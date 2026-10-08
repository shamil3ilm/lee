import type { DiscoveryPrefs, LanguageLevel } from '../relevance/discovery-prefs'
import type { RemoteScope } from '../relevance/prefs'
import type { RegionCode } from '../relevance/places'
import type { SeniorityLevel } from '../relevance/seniority'

/**
 * Deterministic Match Score types. Pure data: safe to import from client
 * components (the "Why this score" popover renders a stored `MatchDetail`).
 */

export const MATCH_COMPONENT_KEYS = [
  'skills',
  'role',
  'seniority',
  'region',
  'workMode',
  'pay',
  'language',
  'visa',
  'domain',
] as const
export type MatchComponentKey = (typeof MATCH_COMPONENT_KEYS)[number]

/** One explainable part of the score: a chip with the points it added. */
export interface MatchComponent {
  key: MatchComponentKey
  /** Short human label, e.g. "Skills 5 of 7 (Laravel, MySQL …)". */
  label: string
  points: number
  /** Most this component can add (penalty-only components: 0). */
  max: number
}

/** What is stored in `discoveries.fit_detail` and rendered in the popover. */
export interface MatchDetail {
  /** Rules version that produced it (MATCH_SCORE_VERSION). */
  v: string
  score: number
  components: MatchComponent[]
  /** Must-haves the profile does not show: "Kubernetes (required)". */
  missing: string[]
  /** Posting skills the profile's ready evidence covers. */
  matched: string[]
}

/** The posting fields the score reads (a subset of NormalizedJob). */
export interface MatchJob {
  title: string
  location?: string | null
  remoteType?: string | null
  descriptionMd?: string | null
  techStack?: readonly string[] | null
  employmentType?: string | null
  salary?: { min?: number; max?: number; currency?: string } | null
}

/**
 * The user's side of the score, derived ONLY from ready evidence: skills
 * marked interview-ready (or backed by a ready item), ready work/projects,
 * and domain-ready items for domain skills.
 */
export interface MatchProfile {
  /** Canonical skills (lib/cv-score/synonyms + match lexicon), implied skills included. */
  skills: ReadonlySet<string>
  /** Ready domain evidence: 'payments' | 'einvoicing'. */
  domains: ReadonlySet<string>
  /** Whole years of experience, or null when unknown. */
  years: number | null
  /** Target seniority levels (search preferences). */
  seniority: readonly SeniorityLevel[]
  roleFamilies: readonly string[]
  customRoles: readonly string[]
  regions: readonly RegionCode[]
  otherCountries: readonly string[]
  remoteScope: RemoteScope
  /** 'any' | 'remote' | 'hybrid' | 'onsite'. */
  remotePref: string
  /** Spoken languages (lower-case name → level); English is assumed. */
  languages: ReadonlyMap<string, LanguageLevel>
  extra: Pick<DiscoveryPrefs, 'basedIn' | 'sponsorshipFor' | 'payFloors' | 'relocationIfSponsored' | 'relocationCountries'>
  /** Search preferences saved at least once. */
  prefsActive: boolean
}
