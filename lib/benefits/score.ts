import { convert, formatPay, type PayPeriod } from '@/lib/discovery/relevance/pay'
import { PAY_CURRENCIES, type PayCurrency } from '@/lib/discovery/relevance/discovery-prefs'
import { isEmpty, type BenefitFactKey, type ExtractedBenefits } from './extract'

/**
 * Benefits score (0–100) from the extracted facts and the user's benefit
 * weights, with a plain-language explanation. The user's weights
 * (Settings › Profile, `benefit_prefs.weights`) cover the headline items;
 * the Gulf staples and other extras use EXTRA_WEIGHTS unless the user set
 * the same key. A weight of 0 removes an item.
 *
 * Unknown is not "no": a posting that states nothing benefits-related gets
 * NULL (never 0), and `coverage` says how much of the weight was stated
 * either way.
 */

/** Weights for items the profile form does not list (yet). */
export const EXTRA_WEIGHTS: Readonly<Record<string, number>> = {
  housing_allowance: 6,
  annual_flights: 5,
  medical_insurance: 5,
  salary_stated: 4,
  end_of_service: 4,
  bonus: 4,
  transport_allowance: 3,
  education_allowance: 3,
  leave_days: 3,
  remote_stipend: 2,
}

/** Used when the profile has no benefit weights at all (DEFAULT_BENEFIT_PREFS). */
export const DEFAULT_PREF_WEIGHTS: Readonly<Record<string, number>> = {
  visa_sponsorship: 10,
  family_health_insurance: 9,
  compensation_meets_floor: 10,
  remote_or_hybrid: 8,
  relocation_package: 7,
  equity: 4,
  four_day_week: 3,
}

export const BENEFIT_LABELS: Readonly<Record<string, string>> = {
  visa_sponsorship: 'Visa sponsorship',
  family_health_insurance: 'Family medical cover',
  medical_insurance: 'Medical insurance',
  compensation_meets_floor: 'Pay meets your floor',
  salary_stated: 'Salary stated',
  remote_or_hybrid: 'Remote or hybrid',
  relocation_package: 'Relocation support',
  equity: 'Equity',
  four_day_week: 'Four-day week',
  housing_allowance: 'Housing allowance',
  transport_allowance: 'Transport allowance',
  annual_flights: 'Annual flights',
  end_of_service: 'End-of-service gratuity',
  bonus: 'Bonus',
  education_allowance: 'Education / learning allowance',
  remote_stipend: 'Remote work stipend',
  leave_days: 'Paid leave',
}

/** Preference keys that read a fact under another name. */
const FACT_FOR: Readonly<Record<string, BenefitFactKey>> = {
  family_health_insurance: 'family_insurance',
  relocation_package: 'relocation',
}

/** Leave at or above this many days earns the full leave weight; 10+ earns half. */
export const FULL_LEAVE_DAYS = 21

export interface PayFloorInput {
  annual: number
  currency: string
}

export type ItemState = 'yes' | 'partial' | 'no' | 'unknown'

export interface BenefitItem {
  key: string
  label: string
  weight: number
  points: number
  state: ItemState
  quote?: string
}

export interface BenefitsScore {
  /** 0–100, or null when the posting states nothing benefits-related. */
  score: number | null
  /** Share of the total weight the posting stated either way (0–1). */
  coverage: number
  items: BenefitItem[]
  explanation: string
}

function isPayCurrency(c: string): c is PayCurrency {
  return (PAY_CURRENCIES as readonly string[]).includes(c)
}

function floorState(b: ExtractedBenefits, floor: PayFloorInput | null): { state: ItemState; quote?: string } {
  if (!b.salary) return { state: 'unknown' }
  const stated = formatPay(b.salary.period === 'month' ? b.salary.monthly : b.salary.annual, b.salary.currency, b.salary.period as PayPeriod)
  if (!floor || floor.annual <= 0) return { state: 'unknown', quote: stated }
  const cur = floor.currency.toUpperCase()
  if (!isPayCurrency(cur)) return { state: 'unknown', quote: stated }
  const inFloorCur = convert(b.salary.annual, b.salary.currency, cur)
  if (inFloorCur === null) return { state: 'unknown', quote: stated }
  return { state: inFloorCur >= floor.annual ? 'yes' : 'no', quote: stated }
}

function evaluate(key: string, b: ExtractedBenefits, floor: PayFloorInput | null): { state: ItemState; quote?: string } {
  if (key === 'compensation_meets_floor') return floorState(b, floor)
  if (key === 'salary_stated') {
    return b.salary ? { state: 'yes', quote: formatPay(b.salary.period === 'month' ? b.salary.monthly : b.salary.annual, b.salary.currency, b.salary.period) } : { state: 'unknown' }
  }
  if (key === 'leave_days') {
    if (b.leaveDays === null) return { state: 'unknown' }
    return { state: b.leaveDays >= FULL_LEAVE_DAYS ? 'yes' : 'partial', quote: `${b.leaveDays} days` }
  }
  const fact = b.facts[(FACT_FOR[key] ?? key) as BenefitFactKey]
  if (!fact) return { state: 'unknown' }
  return { state: fact.value ? 'yes' : 'no', quote: fact.quote }
}

/** The weights in force: the user's (or the defaults) over the extras; 0 drops an item. */
export function effectiveWeights(userWeights: Readonly<Record<string, number>>): Record<string, number> {
  const base = Object.keys(userWeights).length > 0 ? userWeights : DEFAULT_PREF_WEIGHTS
  const merged: Record<string, number> = { ...EXTRA_WEIGHTS, ...base }
  return Object.fromEntries(Object.entries(merged).filter(([, w]) => Number.isFinite(w) && w > 0))
}

function explain(score: number | null, items: readonly BenefitItem[]): string {
  if (score === null) return 'The posting states no benefits or pay.'
  const got = items.filter((i) => i.state === 'yes' || i.state === 'partial')
  const no = items.filter((i) => i.state === 'no')
  const missing = items.filter((i) => i.state === 'unknown').sort((a, b) => b.weight - a.weight).slice(0, 3)
  const parts = [
    got.length > 0 ? `Stated: ${got.map((i) => `${i.label}${i.quote && i.key.startsWith('sal') ? ` (${i.quote})` : ''} +${i.points}`).join(', ')}.` : 'No weighted benefit stated.',
    no.length > 0 ? `Not offered: ${no.map((i) => i.label).join(', ')}.` : '',
    missing.length > 0 ? `Not mentioned: ${missing.map((i) => i.label).join(', ')}.` : '',
  ]
  return parts.filter(Boolean).join(' ')
}

/** Score the extracted benefits against the user's weights and pay floor. */
export function scoreBenefits(
  b: ExtractedBenefits,
  userWeights: Readonly<Record<string, number>>,
  floor: PayFloorInput | null = null,
): BenefitsScore {
  const weights = effectiveWeights(userWeights)
  const items: BenefitItem[] = Object.entries(weights).map(([key, weight]) => {
    const { state, quote } = evaluate(key, b, floor)
    const points = state === 'yes' ? weight : state === 'partial' ? Math.round(weight / 2) : 0
    return { key, label: BENEFIT_LABELS[key] ?? key.replace(/_/g, ' '), weight, points, state, ...(quote ? { quote } : {}) }
  })
  const total = items.reduce((s, i) => s + i.weight, 0)
  const earned = items.reduce((s, i) => s + i.points, 0)
  const known = items.filter((i) => i.state !== 'unknown').reduce((s, i) => s + i.weight, 0)
  const score = isEmpty(b) || total === 0 ? null : Math.round((earned / total) * 100)
  return { score, coverage: total === 0 ? 0 : Math.round((known / total) * 100) / 100, items, explanation: explain(score, items) }
}

/**
 * The legacy `benefits` object `hasBenefit` / `applyCaps` read (must-have
 * benefit caps), built from the extracted facts.
 */
export function toLegacyBenefits(b: ExtractedBenefits): Record<string, unknown> {
  const f = b.facts
  const out: Record<string, unknown> = {}
  if (f.visa_sponsorship) out.visa_sponsorship = f.visa_sponsorship.value
  if (f.relocation) out.relocation_package = f.relocation.value
  if (f.medical_insurance || f.family_insurance) out.insurance = { family_covered: f.family_insurance?.value === true }
  if (f.remote_or_hybrid?.value) out.remote = { hybrid: true }
  if (f.equity?.value) out.equity = true
  if (f.four_day_week?.value) out.four_day_week = true
  if (b.salary) out.compensation = { min: b.salary.min ?? undefined, max: b.salary.max ?? undefined, currency: b.salary.currency }
  for (const key of ['housing_allowance', 'transport_allowance', 'annual_flights', 'end_of_service', 'bonus', 'remote_stipend', 'education_allowance'] as const) {
    if (f[key]) out[key] = f[key]!.value
  }
  return out
}
