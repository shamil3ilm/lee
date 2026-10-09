/**
 * Local companies & startups (Discovery › Companies). Client-safe types:
 * no I/O. A `CompanyCandidate` is what a source yields; the service
 * normalises, dedupes and stores candidates as `company_discoveries` rows of
 * the user's hidden "Local companies" source.
 */

export const COMPANY_SOURCES = ['wikidata', 'github', 'yc', 'linkedin', 'paste', 'directory'] as const
export type CompanySourceTag = (typeof COMPANY_SOURCES)[number]

export const SIZE_BANDS = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const
export type SizeBand = (typeof SIZE_BANDS)[number]

export const STAGES = ['startup', 'scaleup', 'enterprise'] as const
export type CompanyStage = (typeof STAGES)[number]

export const STAGE_LABELS: Readonly<Record<CompanyStage, string>> = {
  startup: 'Startup',
  scaleup: 'Scale-up',
  enterprise: 'Enterprise',
}

/** Small public facts, each from the source named in `CompanyCandidate.sourceTags`. */
export interface CompanyEvidence {
  wikidataId?: string
  githubLogin?: string
  /** Most-used languages of the org's recent public repos, most first. */
  languages?: string[]
  publicRepos?: number
  employees?: number
  /** Year founded. */
  founded?: number
  /** https logo URL (Wikimedia Commons, GitHub avatar, YC). */
  logoUrl?: string
  description?: string
  ycBatch?: string
  /** Open roles on the detected ATS board, when counted. */
  openRoles?: number
  /** careers@ / jobs@ addresses published on the company's own site. */
  contactEmails?: string[]
  /** LinkedIn connections at the company (count only; names are read live). */
  connections?: number
  /** The page that listed it (directory or YC profile). */
  listedAt?: string
  /** Why the careers check stopped (robots, no page). */
  careersNote?: string
  /** Public-sector / nationals-first employer (government ministry, state oil company…). */
  government?: boolean
}

export interface CompanyCandidate {
  name: string
  website?: string
  /** Region-taxonomy ids (most specific known), ancestors added on store. */
  regionIds: string[]
  industries: string[]
  sizeBand?: SizeBand
  stage?: CompanyStage
  sourceTags: string[]
  evidence: CompanyEvidence
}

/** "Not relevant" reasons offered on a company card. */
export const DISMISS_REASONS = ['industry', 'size', 'region', 'government', 'other'] as const
export type DismissReason = (typeof DISMISS_REASONS)[number]

export const DISMISS_REASON_LABELS: Readonly<Record<DismissReason, string>> = {
  industry: 'Wrong industry',
  size: 'Wrong size or stage',
  region: 'Wrong location',
  government: 'Government / nationals first',
  other: 'Other',
}
