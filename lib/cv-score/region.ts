/**
 * v1.1 — the hiring market a CV is aimed at, and the conventions that
 * follow from it. Advice explains the convention; it never demands.
 *
 *   GCC / India — recruiters usually phone or WhatsApp shortlisted
 *                 candidates, so a mobile number with its country code is
 *                 expected; 1–2 pages is normal at any level.
 *   US / UK     — a phone number is optional for remote roles; one page is
 *                 preferred early in a career (under ~5 years).
 *   Unknown     — one page under 3 years, two pages after.
 *
 * Source order: the target job's location, then the user's search
 * preferences (lib/discovery/relevance/prefs.ts).
 */
import { GCC_CODES, regionLabel, scanPlaces } from '@/lib/discovery/relevance/places'
import type { SearchPrefs } from '@/lib/discovery/relevance/prefs'
import type { CvMarket, JobTarget, RegionHint, ScoreContext } from './types'

const EUROPE = new Set(['EU', 'IE'])

function isRemote(location: string | null | undefined, remoteType: string | null | undefined): boolean {
  return /remote/i.test(remoteType ?? '') || /\bremote\b/i.test(location ?? '')
}

/** Market from a job's location / remote type, or null when it names no place. */
export function regionForJob(job: Pick<JobTarget, 'location' | 'remoteType'>): RegionHint | null {
  const location = job.location?.trim()
  if (!location) return null
  const scan = scanPlaces(location, { trustCodes: true })
  const remote = isRemote(location, job.remoteType)
  const base = { source: 'job' as const, ...(remote ? { remote: true } : {}) }
  const gcc = [...scan.regions].filter((c) => (GCC_CODES as readonly string[]).includes(c))
  if (gcc.length) return { ...base, market: 'gcc', label: gcc.map((c) => regionLabel(c)).join(', ') }
  if (scan.regions.has('IN')) return { ...base, market: 'india', label: 'India' }
  if (scan.foreign.has('US')) return { ...base, market: 'us', label: remote ? 'US remote' : 'US' }
  if (scan.foreign.has('GB')) return { ...base, market: 'uk', label: remote ? 'UK remote' : 'UK' }
  if ([...scan.foreign].some((c) => EUROPE.has(c))) return { ...base, market: 'europe', label: 'Europe' }
  if (scan.foreign.size) return { ...base, market: 'other', label: location }
  return null
}

/** Market from saved search preferences (GCC first, then India, then a foreign country). */
export function regionFromSearchPrefs(prefs: SearchPrefs): RegionHint | null {
  if (!prefs.active) return null
  const gcc = prefs.regions.filter((c) => (GCC_CODES as readonly string[]).includes(c))
  const india = prefs.regions.includes('IN')
  if (gcc.length) return { market: 'gcc', source: 'prefs', label: india ? 'GCC and India' : 'GCC' }
  if (india) return { market: 'india', source: 'prefs', label: 'India' }
  const other = prefs.otherCountries
  if (other.includes('US')) return { market: 'us', source: 'prefs', label: 'US' }
  if (other.includes('GB')) return { market: 'uk', source: 'prefs', label: 'UK' }
  return null
}

/** The target job's market wins over the user's general preferences. */
export function resolveRegion(
  target: Pick<JobTarget, 'location' | 'remoteType'> | null | undefined,
  ctx: Pick<ScoreContext, 'region'>,
): RegionHint | null {
  return (target ? regionForJob(target) : null) ?? ctx.region ?? null
}

export interface PageNorm {
  /** Pages above this get a finding. */
  limit: number
  /** Why — shown in the finding. */
  why: string
}

const PHONE_FIRST: readonly CvMarket[] = ['gcc', 'india']

export function pageNorm(years: number, region: RegionHint | null | undefined): PageNorm {
  if (region && PHONE_FIRST.includes(region.market)) {
    return { limit: 2, why: `${region.market === 'gcc' ? 'GCC' : 'Indian'} recruiters commonly read 1–2 page CVs at any level` }
  }
  if (region && (region.market === 'us' || region.market === 'uk')) {
    const where = region.market === 'us' ? 'US' : 'UK'
    return years < 5
      ? { limit: 1, why: `${where}${region.remote ? ' remote' : ''} hiring managers usually prefer one page early in a career` }
      : { limit: 2, why: `two pages is common in the ${where} once you have 5+ years` }
  }
  return years < 3
    ? { limit: 1, why: 'one page is typical with under 3 years of experience' }
    : { limit: 2, why: 'two pages is typical once you have 3+ years' }
}

export interface PhoneAdvice {
  severity: 'minor'
  message: string
  suggestion: string
}

const COUNTRY_CODE_EXAMPLE: Partial<Record<CvMarket, string>> = { gcc: '+971 …', india: '+91 …' }

/**
 * Region-aware phone advice. Returns null when nothing is worth saying —
 * including when no region is known (the generic contact finding covers it).
 */
export function phoneAdvice(phone: string | undefined, region: RegionHint | null | undefined): PhoneAdvice | null {
  if (!region) return null
  if (PHONE_FIRST.includes(region.market)) {
    const where = region.market === 'gcc' ? 'GCC' : 'Indian'
    const example = COUNTRY_CODE_EXAMPLE[region.market] ?? '+…'
    if (!phone) {
      return {
        severity: 'minor',
        message: `No phone number — ${where} recruiters usually call or WhatsApp shortlisted candidates`,
        suggestion: `Consider adding a mobile number with its country code (${example}) so recruiters can reach you quickly.`,
      }
    }
    if (!phone.trim().startsWith('+') && !phone.trim().startsWith('00')) {
      return {
        severity: 'minor',
        message: 'Phone number has no country code',
        suggestion: `${where} recruiters often hire across borders — writing it as ${example} makes it dialable from anywhere.`,
      }
    }
  }
  return null
}

/** True when the market treats a phone number as optional (no finding, full points). */
export function phoneOptional(region: RegionHint | null | undefined): boolean {
  return !!region && (region.market === 'us' || region.market === 'uk' || region.market === 'europe') && region.remote === true
}
