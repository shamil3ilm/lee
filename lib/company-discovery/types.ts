/**
 * Local companies & startups (Discovery › Companies). Client-safe types:
 * no I/O. A `CompanyCandidate` is what a source yields; the service
 * normalises, dedupes and stores candidates as `company_discoveries` rows of
 * the user's hidden "Local companies" source.
 */

export const COMPANY_SOURCES = ['wikidata', 'github', 'yc', 'linkedin', 'paste', 'directory', 'jobs', 'seed', 'search', 'map', 'register'] as const

/** Source tags of the map and register sources (OpenStreetMap, GLEIF, India MCA): shown as "Found via map/register". */
export const MAP_REGISTER_TAGS = ['map:osm', 'register:gleif', 'register:mca'] as const
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
  /** A park profile page that names its website (read once during enrichment). */
  profileUrl?: string
  /** The name a directory listed it under, when that differs (a legal entity). */
  listedAs?: string
  /** Job postings lee saw from this employer (count, last date). */
  jobsSeen?: number
  jobsSeenAt?: string
  /** New postings first seen in the last 30 days and in the 60 before (hiring velocity fallback). */
  jobsRecent30?: number
  jobsPrior60?: number
  /** Growth inputs, refreshed weekly (lib/company-discovery/growth). */
  github?: { at: string; c90: number; cp90: number; nr90: number; nrp90: number; stars: number }
  /** Dated employee counts (Wikidata P1128 + P585), oldest first, ≤ 6. */
  headcount?: Array<{ y: number; n: number }>
  headcountAt?: string
  /** Classified news events of the last 12 months (≤ 6) and when they were checked. */
  news?: { at: string; ev: Array<{ c: string; d: string; u: string; t: string }> }
  /** Hacker News mentions in the last 6 months (r) and the 6 before (p). */
  hn?: { at: string; r: number; p: number }
  /** Why the careers check stopped (robots, no page). */
  careersNote?: string
  /** Public-sector / nationals-first employer (government ministry, state oil company…). */
  government?: boolean
  /** What kind of organisation it is (lib/company-discovery/sectors), from a map tag, a register code or the name. */
  sector?: string
  /** OpenStreetMap element ("node/123") and the tag that listed it ("office=it"). */
  osm?: { id: string; tag: string }
  /** Legal Entity Identifier (GLEIF, CC0). */
  lei?: string
  /** India MCA: corporate identity number and its NIC activity code. */
  cin?: string
  nic?: string
  /** Paid-up capital in INR (India MCA). */
  paidUpCapital?: number
  /** Branches seen on the map with the same name in the area. */
  branches?: number
  /** The website answered (or not) when enrichment checked it. */
  siteLive?: boolean
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
  /** The company's own job board when a source already polls it (employers seen in jobs). */
  board?: { kind: string; slug: string; url: string; sourceId?: string }
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
