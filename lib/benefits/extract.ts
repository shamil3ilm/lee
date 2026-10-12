import { parsePostedPay, type PayPeriod, type PostedPay } from '@/lib/discovery/relevance/pay'

/**
 * Deterministic benefits extraction from a job posting (no AI). Every fact
 * keeps a short verbatim quote so "Why this score" can show where it came
 * from. A benefit the posting never mentions is UNKNOWN, not "no": only an
 * explicit "no visa sponsorship" / "no relocation" is recorded as `false`.
 *
 * Covers the Gulf staples (housing, transport, annual flights, end-of-service
 * gratuity, visa) and the rest of the usual list (medical and family cover,
 * relocation, bonus, remote stipend, education allowance, leave days), plus
 * the stated salary normalised to month and year.
 */

export const BENEFIT_FACT_KEYS = [
  'housing_allowance',
  'transport_allowance',
  'annual_flights',
  'medical_insurance',
  'family_insurance',
  'visa_sponsorship',
  'relocation',
  'end_of_service',
  'bonus',
  'remote_stipend',
  'education_allowance',
  'remote_or_hybrid',
  'equity',
  'four_day_week',
] as const
export type BenefitFactKey = (typeof BENEFIT_FACT_KEYS)[number]

export interface BenefitFact {
  value: boolean
  /** Verbatim snippet (≤ 80 chars) around the match. */
  quote: string
}

export interface StatedSalary {
  min: number | null
  max: number | null
  currency: PostedPay['currency']
  /** The period the posting used (or the one inferred from the amount). */
  period: PayPeriod
  /** Top of range per month and per year. */
  monthly: number
  annual: number
}

export interface ExtractedBenefits {
  facts: Partial<Record<BenefitFactKey, BenefitFact>>
  /** Paid annual leave in days, when stated (10–60). */
  leaveDays: number | null
  salary: StatedSalary | null
}

interface Rule {
  key: BenefitFactKey
  value: boolean
  re: RegExp
}

// Negative rules first: "no visa sponsorship" must not read as a visa benefit.
const RULES: readonly Rule[] = [
  { key: 'visa_sponsorship', value: false, re: /\b(?:no|not|cannot|can['’]t|unable to|do not|don['’]t|does not|will not|won['’]t)\s+(?:provide\s+|offer\s+)?(?:visa\s+)?sponsor(?:ship)?\b|\b(?:own|valid|existing|transferable)\s+(?:uae\s+|saudi\s+|qatar\s+|kuwait\s+)?(?:residence\s+|residency\s+|work\s+|employment\s+)?visa\b|\bmust\s+(?:already\s+)?(?:hold|have)\b[^.\n]{0,30}\bvisa\b/i },
  { key: 'relocation', value: false, re: /\b(?:no|not|without)\s+relocation\b|\brelocation\s+(?:is\s+)?not\s+(?:provided|offered|available|supported)\b|\blocal\s+candidates\s+only\b/i },
  { key: 'visa_sponsorship', value: true, re: /\bvisa\s+(?:sponsorship|provided|will\s+be\s+provided|is\s+provided|support|processing\s+(?:by|from)\s+(?:the\s+)?company)\b|\b(?:employment|work)\s+visa\s+(?:provided|sponsored|included)\b|\bsponsor(?:ship)?\s+(?:of\s+)?(?:your\s+|the\s+)?(?:work\s+|employment\s+)?visa\b|\b(?:company|employer)[\s-]sponsored\s+(?:work\s+|employment\s+)?visa\b|\bvisa\s*[:\-–]\s*(?:provided|yes|included)\b|\bvisa\s*(?:,|\+|&|and)\s*(?:medical|insurance|air|flights?|tickets?|accommodation|housing)\b|\b(?:we|will)\s+sponsor\b/i },
  { key: 'family_insurance', value: true, re: /\b(?:family|dependents?|spouse|children)\b[^.\n]{0,40}\b(?:medical|health)\b|\b(?:medical|health)\s+(?:insurance|cover(?:age)?)\b[^.\n]{0,40}\b(?:family|dependents?|spouse)\b/i },
  { key: 'medical_insurance', value: true, re: /\b(?:medical|health)\s+(?:insurance|cover(?:age)?|benefits?|plan)\b|\bprivate\s+health\s*care\b/i },
  { key: 'annual_flights', value: true, re: /\b(?:annual|yearly|return|home)\s+(?:air\s*)?(?:tickets?|flights?|airfare|air\s+passage)\b|\bair\s*tickets?\b|\bflight\s+allowance\b|\bhome\s+leave\s+(?:tickets?|flights?)\b/i },
  { key: 'housing_allowance', value: true, re: /\b(?:housing|accommodation|rent)\s+(?:allowance|provided|stipend|support)\b|\b(?:company|free|shared|furnished)\s+accommodation\b|\baccommodation\s*(?:,|\+|&|and)\s*(?:transport|visa|medical|food)\b/i },
  { key: 'transport_allowance', value: true, re: /\b(?:transport(?:ation)?|travel|car|fuel|commute)\s+(?:allowance|provided|stipend)\b|\bcompany\s+(?:car|transport(?:ation)?)\b|\bfree\s+transport(?:ation)?\b/i },
  { key: 'end_of_service', value: true, re: /\bgratuity\b|\bend[\s-]of[\s-]service\b|\beosb\b|\bprovident\s+fund\b|\bpension\s+(?:plan|scheme|contributions?)\b/i },
  { key: 'bonus', value: true, re: /\b(?:performance|annual|yearly|quarterly|joining|signing|sign-on|year[\s-]end)\s+bonus(?:es)?\b|\bbonus\s+(?:scheme|plan|structure)\b|\b13th\s+(?:month|salary)\b|\bincentives?\s+(?:plan|scheme)\b/i },
  { key: 'remote_stipend', value: true, re: /\b(?:remote|home[\s-]office|wfh|work[\s-]from[\s-]home|internet|co-?working)\s+(?:stipend|allowance|budget|setup\s+(?:budget|allowance))\b/i },
  { key: 'education_allowance', value: true, re: /\b(?:education|school(?:ing)?|tuition|children['’]s\s+education)\s+(?:allowance|support|fees?\s+(?:support|reimbursement|allowance))\b|\b(?:learning|training|development)\s+(?:budget|allowance|stipend)\b|\b(?:conference|certification|course)s?\s+(?:budget|sponsorship|reimbursement)\b/i },
  { key: 'relocation', value: true, re: /\brelocation\s+(?:package|support|assistance|allowance|provided|bonus|budget)\b|\b(?:help|support)\s+(?:you\s+)?(?:with\s+)?relocat\w*/i },
  { key: 'remote_or_hybrid', value: true, re: /\bfully\s+remote\b|\bremote[\s-](?:first|friendly)\b|\bhybrid\s+(?:work|working|model|setup|role|schedule)\b|\bwork\s+from\s+home\s+(?:\d|days?|options?|policy)\b/i },
  { key: 'equity', value: true, re: /\b(?:stock\s+options?|esops?|equity\s+(?:package|grant|compensation)|rsus?)\b/i },
  { key: 'four_day_week', value: true, re: /\bfour[\s-]day\s+(?:work\s*)?week\b|\b4[\s-]day\s+(?:work\s*)?week\b/i },
]

const LEAVE = /\b(\d{2})\s*(?:working\s+|calendar\s+)?days?\s+(?:of\s+)?(?:paid\s+)?(?:annual\s+)?(?:leave|vacation|holidays?|pto)\b|\b(?:annual|paid)\s+(?:leave|vacation)\s+(?:of\s+)?(\d{2})\s*days\b/i

/** Cap on the text scanned (a JD is rarely longer). */
export const MAX_SCAN_CHARS = 20_000

function quoteAround(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 20)
  const to = Math.min(text.length, index + length + 20)
  const q = text.slice(from, to).replace(/\s+/g, ' ').trim()
  return q.length > 80 ? `${q.slice(0, 77)}…` : q
}

function salaryOf(pay: PostedPay | null): StatedSalary | null {
  if (!pay) return null
  const top = pay.max ?? pay.min
  if (top === null || top <= 0) return null
  const monthly = pay.period === 'month' ? top : top / 12
  return { min: pay.min, max: pay.max, currency: pay.currency, period: pay.period, monthly: Math.round(monthly), annual: Math.round(monthly * 12) }
}

export interface PostingForBenefits {
  title?: string | null
  descriptionMd?: string | null
  /** A JD the user pasted (wins over the source's description when longer). */
  pastedJd?: string | null
  remoteType?: string | null
  salary?: { min?: number; max?: number; currency?: string } | null
}

/** Extract the benefits a posting states. Pure and deterministic. */
export function extractBenefits(posting: PostingForBenefits): ExtractedBenefits {
  const body = [posting.descriptionMd ?? '', posting.pastedJd ?? ''].join('\n')
  const text = `${posting.title ?? ''}\n${body}`.slice(0, MAX_SCAN_CHARS)
  const facts: Partial<Record<BenefitFactKey, BenefitFact>> = {}
  for (const rule of RULES) {
    if (facts[rule.key]) continue
    const m = rule.re.exec(text)
    if (m) facts[rule.key] = { value: rule.value, quote: quoteAround(text, m.index, m[0].length) }
  }
  // Family cover implies medical cover.
  if (facts.family_insurance?.value && !facts.medical_insurance) facts.medical_insurance = { ...facts.family_insurance }
  if (!facts.remote_or_hybrid && (posting.remoteType === 'remote' || posting.remoteType === 'hybrid')) {
    facts.remote_or_hybrid = { value: true, quote: posting.remoteType === 'remote' ? 'Remote' : 'Hybrid' }
  }
  const leave = LEAVE.exec(text)
  const days = leave ? Number(leave[1] ?? leave[2]) : NaN
  const salary = salaryOf(parsePostedPay({ salary: posting.salary ?? null, description: body }))
  return { facts, leaveDays: Number.isFinite(days) && days >= 10 && days <= 60 ? days : null, salary }
}

/** True when the posting states nothing benefits-related at all. */
export function isEmpty(b: ExtractedBenefits): boolean {
  return Object.keys(b.facts).length === 0 && b.leaveDays === null && b.salary === null
}
