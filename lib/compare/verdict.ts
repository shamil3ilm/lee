import { BENEFIT_LABELS, type BenefitKey } from './benefits'
import type { ChecklistRow } from './checklist'
import type { SourceRef } from './evidence'
import type { PayView } from './pay'
import { CRITERION_LABELS, type Criterion } from './types'

/**
 * The one-line verdict, the gains / losses / unknowns lists and the
 * questions to ask, all derived from the criteria and the checklist (no AI).
 */

export interface ListItem {
  text: string
  topic: Criterion
  source: SourceRef | null
}

export interface Question {
  id: string
  text: string
  topic: Criterion | BenefitKey
}

export interface VerdictInput {
  job: Readonly<Record<Criterion, number | null>>
  current: Readonly<Record<Criterion, number | null>> | null
  pay: PayView
  checklist: readonly ChecklistRow[]
}

/** A criterion difference that counts as better or worse. */
export const MEANINGFUL_DIFF = 10

type Direction = 'better' | 'worse' | 'similar' | 'unknown'

function direction(job: number | null, cur: number | null): Direction {
  if (job === null || cur === null) return 'unknown'
  if (job - cur >= MEANINGFUL_DIFF) return 'better'
  if (cur - job >= MEANINGFUL_DIFF) return 'worse'
  return 'similar'
}

const NON_PAY: readonly Criterion[] = ['growth', 'benefits', 'environment', 'stability', 'location', 'work_life']

function payPhrase(pay: PayView): string {
  if (pay.deltaPct === null) return pay.postedText ? 'pay not comparable yet' : 'unknown pay'
  const sign = pay.deltaPct >= 0 ? '+' : ''
  const what = pay.basis === 'gross' ? 'gross pay' : 'take-home'
  return `Likely ${sign}${pay.deltaPct}% ${what}`
}

export function verdictLine(input: VerdictInput): string {
  const parts = [payPhrase(input.pay)]
  for (const c of NON_PAY) {
    const d = direction(input.job[c], input.current?.[c] ?? null)
    const label = CRITERION_LABELS[c].toLowerCase()
    if (d === 'better') parts.push(`better ${label}`)
    else if (d === 'worse') parts.push(`worse ${label}`)
    else if (d === 'unknown' && (c === 'benefits' || c === 'growth')) parts.push(`unknown ${label}`)
  }
  const line = parts.join(', ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

export interface Lists {
  gains: ListItem[]
  losses: ListItem[]
  unknowns: ListItem[]
}

export function gainsAndLosses(input: VerdictInput): Lists {
  const gains: ListItem[] = []
  const losses: ListItem[] = []
  const unknowns: ListItem[] = []
  const pay = input.pay
  const payItem: ListItem = { text: payPhrase(pay), topic: 'pay', source: { kind: 'assumptions', label: 'Your current job and assumptions' } }
  if (pay.deltaPct === null) unknowns.push(payItem)
  else if (pay.deltaPct >= 5) gains.push(payItem)
  else if (pay.deltaPct <= -5) losses.push(payItem)
  for (const row of input.checklist) {
    const item: ListItem = { text: `${row.label}: ${row.job} (now ${row.current})`, topic: 'benefits', source: row.source }
    if (row.verdict === 'better') gains.push(item)
    else if (row.verdict === 'worse') losses.push(item)
    else if (row.verdict === 'unknown') unknowns.push(item)
  }
  for (const c of NON_PAY) {
    if (c === 'benefits') continue
    const d = direction(input.job[c], input.current?.[c] ?? null)
    const label = CRITERION_LABELS[c]
    const rule: SourceRef = { kind: 'rule', label: `${label} criterion` }
    if (d === 'better') gains.push({ text: `Better ${label.toLowerCase()} (${input.job[c]} vs ${input.current?.[c]})`, topic: c, source: rule })
    else if (d === 'worse') losses.push({ text: `Worse ${label.toLowerCase()} (${input.job[c]} vs ${input.current?.[c]})`, topic: c, source: rule })
    else if (input.job[c] === null) unknowns.push({ text: `${label}: not enough to go on`, topic: c, source: null })
  }
  return { gains, losses, unknowns }
}

const BENEFIT_QUESTIONS: Readonly<Record<BenefitKey, string>> = {
  health: 'Is medical insurance included?',
  family_health: 'Does the medical insurance cover my family (spouse and children)?',
  visa: 'Is visa sponsorship provided, and family visa sponsorship too?',
  flights: 'Is an annual return flight home included?',
  housing: 'Is there a housing allowance, or is accommodation provided?',
  transport: 'Is there a transport allowance?',
  bonus: 'Is there a performance or annual bonus, and how is it decided?',
  leave: 'How many days of paid annual leave are there?',
  gratuity: 'Is end-of-service gratuity (or PF / pension) paid, and on what basis?',
  wfh: 'What is the work-from-home or hybrid policy?',
  learning: 'Is there a learning or certification budget?',
  relocation: 'Is relocation support provided (flights, temporary housing)?',
}

const CRITERION_QUESTIONS: Readonly<Partial<Record<Criterion, string>>> = {
  pay: 'What is the salary range for this role (monthly, gross), and what is fixed vs variable?',
  growth: 'What does the growth path look like for this role, and how are promotions decided?',
  environment: 'How would you describe the team culture, and who would I report to?',
  stability: 'How is the team funded, and has there been any recent restructuring?',
  work_life: 'What are the typical working hours, and is there shift, on-call or weekend work?',
  location: 'Is visa sponsorship and relocation support provided for this role?',
}

/** A checklist of questions for the recruiter / HR, one per unknown. */
export function questionsToAsk(input: VerdictInput): Question[] {
  const out: Question[] = []
  const add = (topic: Question['topic'], text: string): void => {
    if (!out.some((q) => q.text === text)) out.push({ id: `q-${topic}`, text, topic })
  }
  if (!input.pay.postedText) add('pay', CRITERION_QUESTIONS.pay!)
  for (const row of input.checklist) {
    if (row.verdict === 'unknown' && row.job === 'Unknown') add(row.key, BENEFIT_QUESTIONS[row.key])
    if (row.key === 'leave' && row.verdict === 'unknown' && row.job === 'Yes') add('leave', BENEFIT_QUESTIONS.leave)
  }
  for (const c of ['growth', 'environment', 'stability', 'work_life', 'location'] as const) {
    if (input.job[c] === null) add(c, CRITERION_QUESTIONS[c]!)
  }
  // The location question repeats the visa one when both are unknown.
  return out.filter((q) => !(q.topic === 'location' && out.some((o) => o.topic === 'visa')))
}

/** "vs current: pay ↑ 35% est. · growth ↑ · benefits ?" for the shortlist and Prepare. */
export function comparisonChip(input: VerdictInput): string {
  const pay = input.pay.deltaPct
  const payPart =
    pay === null ? 'pay ?' : pay >= 5 ? `pay ↑ ${pay}% est.` : pay <= -5 ? `pay ↓ ${Math.abs(pay)}% est.` : 'pay ≈ same'
  const arrow = (c: Criterion): string => {
    const d = direction(input.job[c], input.current?.[c] ?? null)
    return d === 'better' ? '↑' : d === 'worse' ? '↓' : d === 'similar' ? '≈' : '?'
  }
  return `vs current: ${payPart} · growth ${arrow('growth')} · benefits ${arrow('benefits')}`
}

export function benefitQuestion(key: BenefitKey): string {
  return BENEFIT_QUESTIONS[key] ?? `Ask about: ${BENEFIT_LABELS[key]}`
}
