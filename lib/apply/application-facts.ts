import type { ApplicationFact, ApplicationFacts, FactsRegion } from '@/lib/ai/prompts/application-facts'
import type { CurrentJob } from '@/lib/compare/types'
import { noticeLabel, type DiscoveryPrefs } from '@/lib/discovery/relevance/discovery-prefs'
import { isRemotePosting, postingPlaces } from '@/lib/discovery/relevance/gate'
import { GCC_CODES, regionLabel, type RegionCode } from '@/lib/discovery/relevance/places'

/**
 * The region block's facts (lib/ai/prompts/application-facts.ts) for one
 * posting, from the user's PRIVATE settings only, and only what they opted
 * to share: Search preferences (`discoveryPrefs.share`: visa, notice,
 * relocation, time zone on by default; nationality off) and the private
 * current job (`shareCtc`, off by default). Pure: no I/O.
 *
 *   GCC     visa status · notice period · relocation · nationality (opt-in)
 *   India   current and expected CTC (opt-in) · notice period
 *   Remote  time zone (with its UTC offset)
 */

export interface FactsSources {
  prefs: DiscoveryPrefs
  /** Résumé basics (Settings › Profile); empty strings when not entered. */
  basics: { nationality: string; visaStatus: string; noticePeriod: string }
  currentJob: CurrentJob | null
  /** IANA zone from the profile, or null. */
  timezone: string | null
}

export interface FactsJob {
  title: string
  location?: string | null
  remoteType?: string | null
}

export function factsRegion(job: FactsJob): FactsRegion | null {
  if (isRemotePosting({ title: job.title, location: job.location ?? '', remoteType: job.remoteType ?? null })) return 'remote'
  const regions = postingPlaces({ title: job.title, location: job.location ?? '' }).regions
  if (GCC_CODES.some((c) => regions.has(c))) return 'gcc'
  if (regions.has('IN')) return 'india'
  return null
}

function gccCountry(job: FactsJob): RegionCode | null {
  const regions = postingPlaces({ title: job.title, location: job.location ?? '' }).regions
  return GCC_CODES.find((c) => regions.has(c)) ?? null
}

function notice(s: FactsSources): ApplicationFact[] {
  if (!s.prefs.share.notice) return []
  const value = noticeLabel(s.prefs.noticePeriods) ?? s.basics.noticePeriod.trim()
  return value ? [{ label: 'Notice period', value }] : []
}

function gccFacts(job: FactsJob, s: FactsSources): ApplicationFact[] {
  const country = gccCountry(job)
  const name = country ? regionLabel(country) : 'the GCC'
  const local = country !== null && s.prefs.basedIn === country
  const out: ApplicationFact[] = []
  if (s.prefs.share.visa) {
    const needs = country !== null && s.prefs.sponsorshipFor.includes(country) && !local
    const value = s.basics.visaStatus.trim() || (local ? `Based in ${name}; no visa sponsorship needed` : needs ? `Requires employment visa sponsorship for ${name}` : '')
    if (value) out.push({ label: 'Visa', value })
  }
  out.push(...notice(s))
  if (s.prefs.share.relocation && s.prefs.relocationIfSponsored && !local) out.push({ label: 'Relocation', value: `Available to relocate to ${name}` })
  if (s.prefs.share.nationality && s.basics.nationality.trim()) out.push({ label: 'Nationality', value: s.basics.nationality.trim() })
  return out
}

/** ₹7.2 LPA for INR; "AED 216,000 per year" otherwise. */
export function formatYearly(amount: number, currency: string): string {
  if (currency === 'INR') return `₹${(amount / 100_000).toFixed(1).replace(/\.0$/, '')} LPA`
  return `${currency} ${Math.round(amount).toLocaleString('en-US')} per year`
}

function indiaFacts(s: FactsSources): ApplicationFact[] {
  const out: ApplicationFact[] = []
  const job = s.currentJob
  if (job?.shareCtc) {
    if (job.monthlyGross) out.push({ label: 'Current CTC', value: formatYearly(job.monthlyGross * 12, job.currency) })
    if (job.expectedAnnual) out.push({ label: 'Expected CTC', value: formatYearly(job.expectedAnnual, job.currency) })
  }
  return [...out, ...notice(s)]
}

/** "UTC+05:30" for a zone at `now`; null for an unknown zone. */
export function utcOffset(timezone: string, now: Date = new Date()): string | null {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value
    if (!part) return null
    return part === 'GMT' ? 'UTC+00:00' : part.replace('GMT', 'UTC')
  } catch {
    return null
  }
}

function remoteFacts(s: FactsSources, now: Date): ApplicationFact[] {
  if (!s.prefs.share.timezone || !s.timezone) return []
  const offset = utcOffset(s.timezone, now)
  return offset ? [{ label: 'Time zone', value: `${s.timezone} (${offset})` }] : []
}

export function applicationFacts(job: FactsJob, s: FactsSources, now: Date = new Date()): ApplicationFacts | null {
  const region = factsRegion(job)
  if (!region) return null
  const lines = region === 'gcc' ? gccFacts(job, s) : region === 'india' ? indiaFacts(s) : remoteFacts(s, now)
  return lines.length > 0 ? { region, lines } : null
}
