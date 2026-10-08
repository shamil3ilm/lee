import { quoteAround, type SourceRef } from './evidence'

/**
 * Benefits stated in a posting, found by deterministic rules (no AI):
 * the GCC staples (visa, annual flight, housing and transport allowances,
 * gratuity) plus medical cover, bonus, leave, WFH, learning budget and
 * relocation. Every hit keeps a verbatim quote. The parsed job details
 * (jobs.benefits, extracted when the posting was added) count too, labelled
 * as such. A benefit the posting does not mention is unknown, not "no".
 */

export const BENEFIT_KEYS = [
  'health',
  'family_health',
  'visa',
  'flights',
  'housing',
  'transport',
  'bonus',
  'leave',
  'gratuity',
  'wfh',
  'learning',
  'relocation',
] as const
export type BenefitKey = (typeof BENEFIT_KEYS)[number]

export const BENEFIT_LABELS: Readonly<Record<BenefitKey, string>> = {
  health: 'Medical insurance',
  family_health: 'Family medical cover',
  visa: 'Visa sponsorship',
  flights: 'Annual flight home',
  housing: 'Housing / allowance',
  transport: 'Transport allowance',
  bonus: 'Bonus',
  leave: 'Paid annual leave',
  gratuity: 'Gratuity / PF / pension',
  wfh: 'Work from home',
  learning: 'Learning budget',
  relocation: 'Relocation support',
}

export interface PostingBenefit {
  value: 'yes' | 'no'
  /** Leave days, when stated. */
  days?: number
  source: SourceRef
}

export type PostingBenefits = Partial<Record<BenefitKey, PostingBenefit>>

interface Rule {
  key: BenefitKey
  value: 'yes' | 'no'
  re: RegExp
}

// Negative rules come first: "no visa sponsorship" must not read as "visa".
const RULES: readonly Rule[] = [
  { key: 'visa', value: 'no', re: /\b(?:no|not|cannot|can['’]t|unable to|do not|don['’]t|does not|will not)\s+(?:provide\s+|offer\s+)?(?:visa\s+)?sponsor(?:ship)?\b|\bown\s+(?:residence\s+|work\s+)?visa\b/i },
  { key: 'visa', value: 'yes', re: /\bvisa\s+(?:sponsorship|provided|will be provided|support|processing|and\s+(?:medical|insurance|flights?))\b|\b(?:employment|work|residence|residency)\s+visa\b|\bsponsor(?:ship)?\s+(?:of\s+)?(?:your\s+|the\s+)?(?:work\s+)?visa\b|\b(?:company|employer)[\s-]sponsored\s+visa\b|\bvisa\s*[:\-–]\s*(?:provided|yes|included)\b|\bvisa\s*(?:,|\+|&|and)\s*(?:medical|insurance|air|flights?|tickets?|accommodation|housing)\b/i },
  { key: 'family_health', value: 'yes', re: /\b(?:family|dependents?|spouse)\b[^.\n]{0,40}\b(?:medical|health)\b|\b(?:medical|health)\s+(?:insurance|cover(?:age)?)\b[^.\n]{0,40}\b(?:family|dependents?|spouse)\b/i },
  { key: 'health', value: 'yes', re: /\b(?:medical|health)\s+(?:insurance|cover(?:age)?|benefits?|plan)\b|\bprivate\s+health\s*care\b/i },
  { key: 'flights', value: 'yes', re: /\b(?:annual|yearly|return)\s+(?:air\s*)?(?:tickets?|flights?|airfare|air\s+passage)\b|\bair\s*tickets?\b|\bhome\s+leave\s+(?:tickets?|flights?)\b/i },
  { key: 'housing', value: 'yes', re: /\bhousing\s+(?:allowance|provided|stipend|support)\b|\baccommodation\s+(?:provided|allowance)\b|\b(?:company|free|shared)\s+accommodation\b/i },
  { key: 'transport', value: 'yes', re: /\btransport(?:ation)?\s+(?:allowance|provided)\b|\bcar\s+allowance\b|\bcompany\s+(?:car|transport)\b/i },
  { key: 'bonus', value: 'yes', re: /\b(?:performance|annual|yearly|quarterly|joining|signing|sign-on)\s+bonus(?:es)?\b|\bbonus\s+(?:scheme|plan|structure)\b|\b13th\s+(?:month|salary)\b/i },
  { key: 'leave', value: 'yes', re: /\b(\d{2})\s*(?:working\s+|calendar\s+)?days?\s+(?:of\s+)?(?:paid\s+)?(?:annual\s+)?(?:leave|vacation|holidays?|pto)\b|\b(?:annual|paid)\s+leave\s+of\s+(\d{2})\s*days\b|\b(?:annual|paid)\s+(?:leave|vacation)\b/i },
  { key: 'gratuity', value: 'yes', re: /\bgratuity\b|\bend[\s-]of[\s-]service\b|\beosb\b|\bprovident\s+fund\b|\bpension\s+(?:plan|scheme|contributions?)\b/i },
  { key: 'wfh', value: 'yes', re: /\bwork\s+from\s+home\b|\bwfh\b|\bremote[\s-](?:first|friendly)\b|\bfully\s+remote\b|\bhybrid\s+(?:work|working|model|setup|role)\b/i },
  { key: 'learning', value: 'yes', re: /\b(?:learning|training|education|development)\s+(?:budget|allowance|stipend)\b|\b(?:conference|certification|course)s?\s+(?:budget|sponsorship|reimbursement)\b|\bsponsored\s+certifications?\b/i },
  { key: 'relocation', value: 'yes', re: /\brelocation\s+(?:package|support|assistance|allowance|provided|bonus)\b|\b(?:help|support)\s+(?:you\s+)?(?:with\s+)?relocat/i },
]

const POSTING: Omit<SourceRef, 'quote'> = { kind: 'posting', label: 'Posting' }

/** Benefits found in the posting text, each with its verbatim quote. */
export function extractFromText(text: string | null | undefined): PostingBenefits {
  const src = (text ?? '').slice(0, 20_000)
  const out: PostingBenefits = {}
  for (const rule of RULES) {
    if (out[rule.key]) continue
    const m = rule.re.exec(src)
    if (!m) continue
    const days = rule.key === 'leave' ? Number(m[1] ?? m[2] ?? NaN) : NaN
    out[rule.key] = {
      value: rule.value,
      ...(Number.isFinite(days) && days >= 10 && days <= 60 ? { days } : {}),
      source: { ...POSTING, quote: quoteAround(src, m.index, m[0].length) },
    }
  }
  if (out.family_health && !out.health) out.health = { ...out.family_health }
  return out
}

const DETAILS: SourceRef = { kind: 'job_details', label: 'Job details (parsed from the posting)' }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function truthy(v: unknown): boolean {
  return v === true || (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.trim().length > 0) || isObj(v)
}

const STRUCTURED: ReadonlyArray<[BenefitKey, readonly string[]]> = [
  ['visa', ['visa_sponsorship', 'visa']],
  ['relocation', ['relocation_package', 'relocation']],
  ['flights', ['annual_flight', 'air_ticket', 'annual_air_ticket', 'flights']],
  ['housing', ['housing_allowance', 'housing', 'accommodation']],
  ['transport', ['transport_allowance', 'transportation_allowance', 'transport']],
  ['bonus', ['bonus', 'performance_bonus', 'annual_bonus']],
  ['gratuity', ['gratuity', 'end_of_service', 'pension', 'provident_fund']],
  ['learning', ['learning_budget', 'training_budget', 'education_allowance']],
]

/** Benefits in the parsed job details (jobs.benefits); `false` reads as "no". */
export function extractFromStructured(benefits: unknown): PostingBenefits {
  if (!isObj(benefits)) return {}
  const out: PostingBenefits = {}
  for (const [key, names] of STRUCTURED) {
    const name = names.find((n) => n in benefits)
    if (!name) continue
    const v = benefits[name]
    if (v === false) out[key] = { value: 'no', source: DETAILS }
    else if (truthy(v)) out[key] = { value: 'yes', source: DETAILS }
  }
  const insurance = benefits.insurance
  if (isObj(insurance) || insurance === true) {
    out.health = { value: 'yes', source: DETAILS }
    if (isObj(insurance) && insurance.family_covered === true) out.family_health = { value: 'yes', source: DETAILS }
  }
  const remote = benefits.remote
  if (isObj(remote) && (remote.fully_remote === true || remote.hybrid === true)) out.wfh = { value: 'yes', source: DETAILS }
  const leave = benefits.annual_leave ?? benefits.leave_days ?? benefits.paid_leave
  if (typeof leave === 'number' && leave >= 10 && leave <= 60) out.leave = { value: 'yes', days: leave, source: DETAILS }
  return out
}

/**
 * Everything known about the posting's benefits. The posting text wins (it
 * has a quote); parsed details fill the gaps; the work mode answers WFH.
 */
export function postingBenefits(input: {
  text: string | null | undefined
  structured?: unknown
  remoteType?: string | null
}): PostingBenefits {
  const fromText = extractFromText(input.text)
  const merged: PostingBenefits = { ...extractFromStructured(input.structured), ...fromText }
  if (!merged.wfh && (input.remoteType === 'remote' || input.remoteType === 'hybrid' || input.remoteType === 'onsite')) {
    const value = input.remoteType === 'onsite' ? 'no' : 'yes'
    merged.wfh = { value, source: { kind: 'job_details', label: `Work mode: ${input.remoteType}` } }
  }
  return merged
}
