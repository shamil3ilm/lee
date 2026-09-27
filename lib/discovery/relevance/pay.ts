import type { PayCurrency, PayFloor } from './discovery-prefs'
import { GCC_CODES, type RegionCode } from './places'
import { normalizeForMatch } from './text'

/**
 * Pay floors per region, compared only when a posting states pay.
 *
 * GCC currencies convert through their US-dollar pegs (units per 1 USD),
 * as published by each central bank; checked 2026-09-27:
 *   AED 3.6725 — Central Bank of the UAE, pegged since 1997
 *   SAR 3.75   — Saudi Central Bank (SAMA), pegged since 1986
 *   QAR 3.64   — Qatar Central Bank, pegged since 2001 (Law No. 34 of 2001)
 *   BHD 0.376  — Central Bank of Bahrain, pegged since 1980
 *   OMR 0.3845 — Central Bank of Oman, pegged since 1986
 *   KWD ≈ 0.307 — Central Bank of Kuwait pegs the dinar to an undisclosed
 *                 basket (since 2007), not to the dollar alone; this rate is
 *                 an approximation and drifts slightly.
 * INR floats, so an INR floor is only compared with INR pay, never converted.
 */
export const USD_PEGS: Readonly<Record<Exclude<PayCurrency, 'INR'>, number>> = {
  USD: 1,
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  BHD: 0.376,
  OMR: 0.3845,
  KWD: 0.307,
}

export type PayPeriod = 'month' | 'year'

export interface PostedPay {
  min: number | null
  max: number | null
  currency: PayCurrency
  period: PayPeriod
}

const CURRENCY_WORDS: ReadonlyArray<[RegExp, PayCurrency]> = [
  [/^(?:aed|dhs?|dirhams?)$/, 'AED'],
  [/^(?:sar|sr|riyals?)$/, 'SAR'],
  [/^qar$/, 'QAR'],
  [/^(?:kwd|kd)$/, 'KWD'],
  [/^(?:bhd|bd)$/, 'BHD'],
  [/^(?:omr|ro)$/, 'OMR'],
  [/^(?:inr|rs|₹)$/, 'INR'],
  [/^(?:usd|\$|us\$)$/, 'USD'],
]

function currencyOf(token: string): PayCurrency | null {
  const t = token.replace(/\.$/, '').toLowerCase()
  for (const [re, c] of CURRENCY_WORDS) if (re.test(t)) return c
  return null
}

function num(raw: string | undefined, k: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return k ? n * 1_000 : n
}

const CUR = '(aed|dhs?|dirhams?|sar|sr|riyals?|qar|kwd|kd|bhd|bd|omr|ro|inr|rs\\.?|₹|usd|us\\$|\\$)'
const AMT = '(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k)?'
const PERIOD = '(?:\\s*(?:\\/|per|a|p\\.?)\\s*(month|mo|monthly|m|year|yr|annum|annually|a|pa|p\\.a\\.)\\b)?'
const CUR_FIRST = new RegExp(`${CUR}\\s*${AMT}(?:\\s*(?:-|to)\\s*${CUR}?\\s*${AMT})?${PERIOD}`)
const AMT_FIRST = new RegExp(`\\b${AMT}(?:\\s*(?:-|to)\\s*${AMT})?\\s*${CUR}${PERIOD}`)
const LPA = /\b(\d{1,3}(?:\.\d+)?)\s*(?:(?:-|to)\s*(\d{1,3}(?:\.\d+)?))?\s*(?:lpa|l\.p\.a|lakhs?(?:\s*per\s*annum|\s*p\.?a\.?)?|lacs?)\b/

function periodOf(token: string | undefined, top: number, currency: PayCurrency): PayPeriod {
  if (token) return /^(?:month|mo|monthly|m)$/.test(token) ? 'month' : 'year'
  // No period stated: infer from size (monthly GCC salaries rarely exceed 60k).
  const threshold = currency === 'INR' ? 300_000 : currency === 'USD' ? 20_000 : 60_000
  return top < threshold ? 'month' : 'year'
}

/** Smallest plausible monthly figure per currency; below it a match is noise ("USD 2"). */
const MIN_AMOUNT: Readonly<Record<PayCurrency, number>> = {
  AED: 500, SAR: 500, QAR: 500, KWD: 50, BHD: 50, OMR: 50, INR: 5_000, USD: 300,
}

/** Pay stated in a posting's structured salary or description, if any. */
export function parsePostedPay(input: {
  salary?: { min?: number; max?: number; currency?: string } | null
  description?: string | null
}): PostedPay | null {
  const pay = parseRaw(input)
  if (!pay) return null
  const top = pay.max ?? pay.min ?? 0
  return top >= MIN_AMOUNT[pay.currency] ? pay : null
}

function parseRaw(input: {
  salary?: { min?: number; max?: number; currency?: string } | null
  description?: string | null
}): PostedPay | null {
  const s = input.salary
  const structuredCur = s?.currency ? currencyOf(s.currency) : null
  if (s && structuredCur && (s.min || s.max)) {
    const top = s.max ?? s.min ?? 0
    return { min: s.min ?? null, max: s.max ?? null, currency: structuredCur, period: periodOf(undefined, top, structuredCur) }
  }
  const d = normalizeForMatch((input.description ?? '').slice(0, 8_000))
  const lpa = LPA.exec(d)
  if (lpa) {
    const a = Number(lpa[1]) * 100_000
    const b = lpa[2] ? Number(lpa[2]) * 100_000 : null
    return { min: a, max: b ?? a, currency: 'INR', period: 'year' }
  }
  const m = CUR_FIRST.exec(d)
  if (m) {
    const currency = currencyOf(m[1]!)
    const lo = num(m[2], m[3])
    const hi = num(m[5], m[6])
    if (currency && lo) return { min: lo, max: hi ?? lo, currency, period: periodOf(m[7], hi ?? lo, currency) }
  }
  const a = AMT_FIRST.exec(d)
  if (a) {
    const currency = currencyOf(a[5]!)
    const lo = num(a[1], a[2])
    const hi = num(a[3], a[4])
    if (currency && lo) return { min: lo, max: hi ?? lo, currency, period: periodOf(a[6], hi ?? lo, currency) }
  }
  return null
}

/** Convert an amount between USD-pegged currencies; null for INR ↔ other. */
export function convert(amount: number, from: PayCurrency, to: PayCurrency): number | null {
  if (from === to) return amount
  if (from === 'INR' || to === 'INR') return null
  return (amount / USD_PEGS[from]) * USD_PEGS[to]
}

function perPeriod(amount: number, from: PayPeriod, to: PayPeriod): number {
  if (from === to) return amount
  return from === 'year' ? amount / 12 : amount * 12
}

/** The floor for a posting's region: a country floor wins over the GCC floor. */
export function floorFor(floors: readonly PayFloor[], regions: ReadonlySet<RegionCode>): PayFloor | null {
  if (regions.has('IN')) return floors.find((f) => f.scope === 'IN') ?? null
  const country = floors.find((f) => f.scope !== 'IN' && f.scope !== 'GCC' && regions.has(f.scope as RegionCode))
  if (country) return country
  if (GCC_CODES.some((c) => regions.has(c))) return floors.find((f) => f.scope === 'GCC') ?? null
  return null
}

export function formatPay(amount: number, currency: PayCurrency, period: PayPeriod): string {
  if (currency === 'INR' && period === 'year' && amount >= 100_000) {
    const lakhs = amount / 100_000
    return `₹${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)} LPA`
  }
  return `${currency} ${Math.round(amount).toLocaleString('en-US')}/${period === 'month' ? 'mo' : 'yr'}`
}

function rangeText(pay: PostedPay): string {
  const lo = pay.min ?? pay.max ?? 0
  const hi = pay.max ?? lo
  if (lo === hi) return formatPay(hi, pay.currency, pay.period)
  const unit = formatPay(hi, pay.currency, pay.period)
  if (pay.currency === 'INR' && pay.period === 'year') return `₹${lo / 100_000}–${unit.slice(1)}`
  return `${pay.currency} ${Math.round(lo).toLocaleString('en-US')}–${unit.slice(pay.currency.length + 1)}`
}

export interface PayAssessment {
  /** The posting's figure, plus the floor-currency equivalent when they differ. */
  figure: string
  /** Top of the posted range sits clearly under the user's floor. */
  below: boolean
}

/**
 * Compare in the POSTING's currency: the user's floor (e.g. AED/month for
 * the GCC) is converted through the pegs into SAR, QAR, KWD, BHD or OMR,
 * and the posting's top of range is checked against it. INR floors are
 * compared with INR pay only.
 */
export function assessPay(pay: PostedPay, floor: PayFloor | null): PayAssessment {
  const top = pay.max ?? pay.min ?? 0
  const posted = rangeText(pay)
  if (!floor) return { figure: posted, below: false }
  const floorInPosting = convert(floor.amount, floor.currency, pay.currency)
  const inFloorCur = convert(top, pay.currency, floor.currency)
  const equivalent =
    pay.currency !== floor.currency && inFloorCur !== null
      ? ` (≈ ${formatPay(perPeriod(inFloorCur, pay.period, floor.period), floor.currency, floor.period)})`
      : ''
  if (floorInPosting === null) return { figure: posted, below: false }
  const floorSamePeriod = perPeriod(floorInPosting, floor.period, pay.period)
  return { figure: `${posted}${equivalent}`, below: top < floorSamePeriod * 0.95 }
}
