import { applyChannel, type ChannelInput } from './channel'
import { photoCountry, type CountryInput } from './country'
import { employerKind, type EmployerInput } from './employer'

/**
 * "Photo: Recommended / Optional / Avoid" for one job, with its reasons.
 * Deterministic, explainable rules (docs/resume-and-portfolio.md › Photo
 * advice):
 *
 * The posting decides when it is explicit:
 *   "do not include photos" / "no photo"                     → Avoid
 *   "attach photo", "passport-size photo(graph)", "recent
 *   photograph"                                              → Recommended
 *
 * Otherwise the factors add up (≥ +2 Recommended, ≤ −2 Avoid, else Optional):
 *   country   GCC +1 · DACH 0 · other Europe −1 · remote −1 · India −2
 *             (not needed) · US / UK / CA / AU / IE / NL −4
 *   employer  government or semi-government +2 · bank or airline +1 ·
 *             startup / fintech / global tech −1 (the GCC lean applies to
 *             local employers; elsewhere the country rule dominates)
 *   channel   ATS form −1 · email to a recruiter +1 in the GCC
 *   posting   an equal-opportunity statement −3
 */

export type PhotoVerdict = 'recommended' | 'optional' | 'avoid'

export const PHOTO_LABELS: Readonly<Record<PhotoVerdict, string>> = {
  recommended: 'Recommended',
  optional: 'Optional',
  avoid: 'Avoid',
}

export interface PhotoFactor {
  key: 'posting' | 'country' | 'employer' | 'channel'
  effect: number
  label: string
}

export interface PhotoAdvice {
  advice: PhotoVerdict
  /** The decisive reason first. */
  reasons: string[]
  factors: PhotoFactor[]
}

export type PhotoJob = CountryInput & EmployerInput & ChannelInput

const ASKS_PHOTO =
  /\b(?:attach|attached|enclose|include|send|submit|upload)\b[^.\n]{0,25}?\b(?:photo|photograph)s?\b|\bpassport[- ]sized?\s+(?:photo|photograph|picture)s?\b|\brecent\s+(?:passport\s+)?(?:photo|photograph)s?\b|\b(?:cv|resume)\s+with\s+(?:a\s+)?(?:photo|photograph)\b/i
const NO_PHOTO =
  /\b(?:do not|don['’]t|please don['’]t|never)\s+(?:include|attach|send|add)\b[^.\n]{0,30}?\b(?:photo|photograph|picture)s?\b|\bno\s+(?:photos?|photographs?|pictures?)\b|\bwithout\s+(?:a\s+)?(?:photo|photograph|picture)\b/i
const EQUAL_OPPORTUNITY = /\bequal(?:[- ]employment)?[- ]opportunit(?:y|ies)\b|\bEEO\b|\bwe do not discriminate\b|\bwithout regard to (?:race|age|sex|gender)\b/i

const COUNTRY_EFFECT = {
  gcc: 1,
  dach: 0,
  europe: -1,
  remote: -1,
  india: -2,
  avoid: -4,
  unknown: 0,
} as const

function countryLabel(kind: keyof typeof COUNTRY_EFFECT, place: string): string {
  switch (kind) {
    case 'gcc':
      return `${place}: a photo is common on GCC CVs, especially for local and semi-government employers`
    case 'dach':
      return `${place}: optional; still common, but no longer expected`
    case 'europe':
      return `${place}: usually left off in Europe unless asked`
    case 'remote':
      return 'Remote: reviewers abroad and ATS parsers do not expect a photo'
    case 'india':
      return 'India: not needed on Indian CVs'
    case 'avoid':
      return `${place}: leave it off; photos invite bias claims and many firms discard CVs with one`
    case 'unknown':
      return 'Location not stated'
  }
}

const EMPLOYER_EFFECT = { government: 2, semi_gov: 2, bank: 1, airline: 1, startup: -1, unknown: 0 } as const
const EMPLOYER_LABEL = {
  government: 'Government employer',
  semi_gov: 'Semi-government employer',
  bank: 'Bank',
  airline: 'Airline',
  startup: 'Startup / fintech / global tech: a photo is optional, lean no',
  unknown: '',
} as const

function verdictOf(total: number): PhotoVerdict {
  if (total >= 2) return 'recommended'
  if (total <= -2) return 'avoid'
  return 'optional'
}

export function photoAdvice(job: PhotoJob): PhotoAdvice {
  const text = (job.descriptionMd ?? '').slice(0, 8_000)
  if (NO_PHOTO.test(text)) {
    return { advice: 'avoid', reasons: ['The posting asks for no photo'], factors: [{ key: 'posting', effect: -10, label: 'The posting asks for no photo' }] }
  }
  if (ASKS_PHOTO.test(text)) {
    return { advice: 'recommended', reasons: ['The posting asks for a photo'], factors: [{ key: 'posting', effect: 10, label: 'The posting asks for a photo' }] }
  }
  const factors: PhotoFactor[] = []
  const country = photoCountry(job)
  factors.push({ key: 'country', effect: COUNTRY_EFFECT[country.kind], label: countryLabel(country.kind, country.label) })
  const employer = employerKind(job)
  if (employer.kind !== 'unknown') {
    // A local employer's lean only counts where photos are a local custom.
    const local = country.kind === 'gcc' || country.kind === 'unknown'
    const effect = EMPLOYER_EFFECT[employer.kind] > 0 && !local ? 0 : EMPLOYER_EFFECT[employer.kind]
    factors.push({ key: 'employer', effect, label: `${EMPLOYER_LABEL[employer.kind]} (${employer.source})` })
  }
  const channel = applyChannel(job)
  if (channel.kind === 'ats') factors.push({ key: 'channel', effect: -1, label: 'Applied through an ATS form: optional, lean no' })
  if (channel.kind === 'email' && country.kind === 'gcc') factors.push({ key: 'channel', effect: 1, label: 'Sent by email to a recruiter: CVs are read as documents' })
  if (EQUAL_OPPORTUNITY.test(text)) factors.push({ key: 'posting', effect: -3, label: 'The posting has an equal-opportunity statement' })
  const total = factors.reduce((s, f) => s + f.effect, 0)
  const advice = verdictOf(total)
  // The decisive reason first: the strongest factor pointing the same way.
  const sign = advice === 'recommended' ? 1 : advice === 'avoid' ? -1 : 0
  const ordered = [...factors].sort((a, b) => (sign === 0 ? Math.abs(b.effect) - Math.abs(a.effect) : sign * (b.effect - a.effect)))
  return { advice, reasons: ordered.map((f) => f.label).filter(Boolean), factors }
}
