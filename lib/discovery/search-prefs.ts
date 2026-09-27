import { z } from 'zod'

/**
 * Search parameters for the job-search API adapters (Himalayas, Jobicy,
 * Adzuna …). Built from, in order: the source's own config, the user's
 * profile, then defaults that match lee's target market (GCC + India,
 * backend / full-stack). Pure: callers pass the profile in.
 */

export const DEFAULT_KEYWORDS = ['backend developer', 'full stack developer'] as const
/** ISO 3166-1 alpha-2, upper case: the GCC and India. */
export const DEFAULT_COUNTRIES = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'] as const

export type Seniority = 'junior' | 'mid' | 'senior'

export interface SearchPrefs {
  keywords: string[]
  countries: string[]
  seniority: Seniority[]
}

/** Optional per-source overrides stored in sources.config. */
export const searchConfigSchema = z
  .object({
    keywords: z.union([z.string(), z.array(z.string())]).optional(),
    countries: z.union([z.string(), z.array(z.string())]).optional(),
    country: z.string().optional(),
  })
  .passthrough()

export interface ProfileSearchInput {
  keywords?: readonly string[] | null
  roleTypes?: readonly string[] | null
  seniority?: string | null
  locationPrefs?: unknown
}

const MAX_KEYWORDS = 3
const MAX_KEYWORD_LEN = 60

function list(v: string | readonly string[] | undefined): string[] {
  if (v === undefined) return []
  const arr = typeof v === 'string' ? v.split(',') : v
  return arr.map((s) => s.trim()).filter(Boolean)
}

function uniq(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const k = v.toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(v)
    }
  }
  return out
}

/** Role types like "Backend", "Full-stack" become "backend developer" searches. */
function roleKeywords(roleTypes: readonly string[]): string[] {
  return roleTypes
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
    .map((r) => (/(developer|engineer)\b/.test(r) ? r : `${r.replace(/[-_]/g, ' ')} developer`))
}

function profileCountries(locationPrefs: unknown): string[] {
  if (!Array.isArray(locationPrefs)) return []
  return locationPrefs
    .map((p) => (p && typeof p === 'object' ? (p as { country?: unknown }).country : undefined))
    .filter((c): c is string => typeof c === 'string' && /^[A-Za-z]{2}$/.test(c))
    .map((c) => c.toUpperCase())
}

/**
 * Junior / mid unless the profile says otherwise. "senior" still searches
 * mid as well: many GCC postings mark 3–5 years as senior.
 */
function seniorityFor(profileSeniority: string | null | undefined): Seniority[] {
  const s = (profileSeniority ?? '').toLowerCase()
  if (/senior|staff|principal|lead/.test(s)) return ['mid', 'senior']
  if (/junior|entry|graduate|intern/.test(s)) return ['junior']
  if (/mid/.test(s)) return ['junior', 'mid']
  return ['junior', 'mid']
}

export function buildSearchPrefs(config: unknown, profile: ProfileSearchInput | null): SearchPrefs {
  const parsed = searchConfigSchema.safeParse(config ?? {})
  const cfg = parsed.success ? parsed.data : {}
  const configKeywords = list(cfg.keywords)
  const profileKeywords = uniq([...roleKeywords(profile?.roleTypes ?? []), ...(profile?.keywords ?? [])])
  const keywords = uniq(
    (configKeywords.length > 0 ? configKeywords : profileKeywords.length > 0 ? profileKeywords : [...DEFAULT_KEYWORDS])
      .map((k) => k.slice(0, MAX_KEYWORD_LEN)),
  ).slice(0, MAX_KEYWORDS)

  const configCountries = [...list(cfg.countries), ...list(cfg.country)]
    .filter((c) => /^[A-Za-z]{2}$/.test(c))
    .map((c) => c.toUpperCase())
  const fromProfile = profileCountries(profile?.locationPrefs)
  const countries = uniq(
    configCountries.length > 0 ? configCountries : fromProfile.length > 0 ? fromProfile : [...DEFAULT_COUNTRIES],
  )
  return { keywords, countries, seniority: seniorityFor(profile?.seniority) }
}

/** Places that identify a target country in free-text locations. */
const PLACE_WORDS: Readonly<Record<string, readonly string[]>> = {
  AE: ['united arab emirates', 'uae', 'dubai', 'abu dhabi', 'sharjah', 'ajman', 'ras al khaimah', 'fujairah'],
  SA: ['saudi arabia', 'ksa', 'riyadh', 'jeddah', 'dammam', 'khobar', 'dhahran', 'neom'],
  QA: ['qatar', 'doha'],
  KW: ['kuwait'],
  BH: ['bahrain', 'manama'],
  OM: ['oman', 'muscat'],
  IN: [
    'india', 'bengaluru', 'bangalore', 'hyderabad', 'chennai', 'mumbai', 'pune', 'delhi', 'gurgaon', 'gurugram',
    'noida', 'kochi', 'cochin', 'kerala', 'thiruvananthapuram', 'trivandrum', 'kolkata', 'ahmedabad', 'jaipur',
    'coimbatore', 'kozhikode', 'calicut',
  ],
}

/**
 * True when a free-text location names one of the target countries (by
 * country name or a major city). Used only where a backend gives no
 * machine-readable country; unknown text is treated as a miss.
 */
export function locationMatchesCountries(text: string, countries: readonly string[]): boolean {
  const t = ` ${text.toLowerCase().replace(/[^a-z]+/g, ' ')} `
  return countries.some((c) => (PLACE_WORDS[c] ?? [COUNTRY_NAMES[c]?.toLowerCase() ?? '']).some((w) => w && t.includes(` ${w} `)))
}

/** Country names as job boards spell them. */
export const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Oman',
  IN: 'India',
}
