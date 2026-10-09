import { LANGUAGE_LEVELS } from '../relevance/discovery-prefs'
import { postingPlaces, isRemotePosting } from '../relevance/gate'
import { assessPay, floorFor, parsePostedPay } from '../relevance/pay'
import { GCC_CODES, regionLabel, type RegionCode } from '../relevance/places'
import {
  detectLanguages,
  detectMandatoryLanguages,
  detectNationalsOnly,
  detectNationalsPreferred,
  detectPresenceRequired,
  detectVisaOffered,
} from '../relevance/signals'
import { findTerms, normalizeForMatch } from '../relevance/text'
import { EINVOICING_TERMS, PAYMENTS_TERMS } from './profile'
import type { MatchComponent, MatchJob, MatchProfile } from './types'

/**
 * Soft signals: pay (−5…+5), languages (−25…+3), visa / sponsorship for
 * GCC postings (−15…+5) and the domain bonus (0…+10). Each always returns
 * a component, at 0 points when the posting says nothing.
 */

export const SIGNAL_LIMITS = {
  pay: { min: -5, max: 5 },
  language: { min: -25, max: 3 },
  visa: { min: -15, max: 5 },
  domain: { min: 0, max: 10 },
} as const

const WINDOW = 8_000

export function payComponent(job: MatchJob, p: Pick<MatchProfile, 'extra'>): MatchComponent {
  const max = SIGNAL_LIMITS.pay.max
  const pay = parsePostedPay({ salary: job.salary, description: job.descriptionMd })
  if (!pay) return { key: 'pay', label: 'Pay: not stated', points: 0, max }
  const floor = floorFor(p.extra.payFloors, postingPlaces(job).regions)
  const { figure, below } = assessPay(pay, floor)
  if (!floor) return { key: 'pay', label: `Pay: ${figure}`, points: 2, max }
  if (below) return { key: 'pay', label: `Pay: ${figure}, below your range`, points: SIGNAL_LIMITS.pay.min, max }
  return { key: 'pay', label: `Pay: ${figure}, meets your range`, points: max, max }
}

const LEVEL_RANK = new Map(LANGUAGE_LEVELS.map((l, i) => [l, i] as const))
const PROFESSIONAL = LEVEL_RANK.get('professional') ?? 2

const title = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** A required language you do not speak well; a MANDATORY one ("must be fluent") costs more and caps the band. */
export const LANGUAGE_PENALTY = { required: -10, mandatory: -25, preferred: -2 } as const

export interface LanguageOutcome {
  component: MatchComponent
  missing: string[]
  /** Mandatory languages the user does not speak well: "Arabic". */
  mandatoryUnmet: string[]
}

export function languageComponent(job: MatchJob, p: Pick<MatchProfile, 'languages'>): LanguageOutcome {
  const { min, max } = SIGNAL_LIMITS.language
  const mentions = detectLanguages({ title: job.title, description: job.descriptionMd ?? '' }).filter(
    (m) => m.language !== 'english',
  )
  if (mentions.length === 0) {
    return { component: { key: 'language', label: 'Language: English only', points: 0, max }, missing: [], mandatoryUnmet: [] }
  }
  const mandatory = new Set(detectMandatoryLanguages({ title: job.title, description: job.descriptionMd ?? '' }))
  let points = 0
  const parts: string[] = []
  const missing: string[] = []
  const mandatoryUnmet: string[] = []
  for (const m of mentions) {
    const level = p.languages.get(m.language) ?? null
    const fluent = level !== null && (LEVEL_RANK.get(level) ?? 0) >= PROFESSIONAL
    const name = title(m.language)
    if (fluent) {
      points += max
      parts.push(`${name} (you: ${level})`)
    } else if (m.required || mandatory.has(m.language)) {
      points += mandatory.has(m.language) ? LANGUAGE_PENALTY.mandatory : LANGUAGE_PENALTY.required
      if (mandatory.has(m.language)) mandatoryUnmet.push(name)
      parts.push(`${name} required (you: ${level ?? 'none'})`)
      missing.push(`${name} fluency (required)`)
    } else {
      points += LANGUAGE_PENALTY.preferred
      parts.push(`${name} preferred (you: ${level ?? 'none'})`)
    }
  }
  const clamped = Math.max(min, Math.min(max, points))
  return { component: { key: 'language', label: `Language: ${parts.join(', ')}`, points: clamped, max }, missing, mandatoryUnmet }
}

/** GCC countries the posting is located in where the user needs an employer visa. */
function sponsorshipCountries(job: MatchJob, p: Pick<MatchProfile, 'extra'>): RegionCode[] {
  const { sponsorshipFor, basedIn } = p.extra
  return [...postingPlaces(job).regions].filter(
    (r) => GCC_CODES.includes(r) && sponsorshipFor.includes(r) && r !== basedIn,
  )
}

export function visaComponent(job: MatchJob, p: Pick<MatchProfile, 'extra'>): MatchComponent {
  const { min, max } = SIGNAL_LIMITS.visa
  const c = (points: number, label: string): MatchComponent => ({ key: 'visa', label, points, max })
  const description = job.descriptionMd ?? ''
  const needs = sponsorshipCountries(job, p)
  const remote = isRemotePosting(job)
  const nationals = detectNationalsOnly(description, job.title)
  if (nationals && (needs.length > 0 || (p.extra.sponsorshipFor.length > 0 && !remote))) {
    return c(min, 'Visa: nationals only (e.g. Emiratisation, Saudization)')
  }
  if (!remote && needs.length > 0 && detectNationalsPreferred(description)) return c(-5, 'Visa: nationals preferred')
  if (remote || needs.length === 0) return c(0, p.extra.sponsorshipFor.length > 0 ? 'Visa: no sponsorship needed here' : 'Visa: not relevant')
  const country = regionLabel(needs[0]!)
  if (detectVisaOffered(description)) return c(max, `Visa: offered for ${country}`)
  if (detectPresenceRequired(description)) return c(-3, `Visa: wants candidates already in ${country}`)
  return c(0, `Visa: not mentioned (you need sponsorship in ${country})`)
}

export function domainComponent(job: MatchJob, p: Pick<MatchProfile, 'domains'>): MatchComponent {
  const max = SIGNAL_LIMITS.domain.max
  const text = normalizeForMatch(
    [job.title, (job.techStack ?? []).join(' '), (job.descriptionMd ?? '').slice(0, WINDOW)].join(' \n '),
  )
  const asks: Array<{ id: string; label: string }> = []
  if (findTerms(text, PAYMENTS_TERMS).length > 0) asks.push({ id: 'payments', label: 'payments' })
  if (findTerms(text, EINVOICING_TERMS).length > 0) asks.push({ id: 'einvoicing', label: 'e-invoicing / ZATCA' })
  if (asks.length === 0) return { key: 'domain', label: 'Domain: no domain match', points: 0, max }
  const mine = asks.filter((a) => p.domains.has(a.id))
  if (mine.length === 0) {
    return { key: 'domain', label: `Domain: ${asks.map((a) => a.label).join(', ')} (no ready evidence)`, points: 0, max }
  }
  return { key: 'domain', label: `Domain: ${mine.map((a) => a.label).join(' + ')}`, points: Math.min(max, mine.length * 5), max }
}
