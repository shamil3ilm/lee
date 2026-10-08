import { BENEFIT_KEYS, BENEFIT_LABELS, type BenefitKey, type PostingBenefit, type PostingBenefits } from './benefits'
import { clampScore, withIds, type CriterionResult, type EvidenceDraft, type SourceRef } from './evidence'
import type { CurrentBenefits } from './types'

/**
 * Side-by-side benefits checklist: the posting vs the current job, each
 * row better / same / worse / unknown. Unknown on either side stays
 * unknown (and becomes a question to ask), never a "no".
 */

export type Verdict = 'better' | 'same' | 'worse' | 'unknown'
type Side = 'yes' | 'no' | 'unknown' | 'n/a'

export interface ChecklistRow {
  key: BenefitKey
  label: string
  current: string
  job: string
  verdict: Verdict
  source: SourceRef | null
}

const CURRENT: SourceRef = { kind: 'current_job', label: 'Your current job' }

function tri(v: boolean | null): Side {
  return v === null ? 'unknown' : v ? 'yes' : 'no'
}

function currentSide(key: BenefitKey, c: CurrentBenefits): Side {
  switch (key) {
    case 'health':
      return c.health === 'unknown' ? 'unknown' : c.health === 'none' ? 'no' : 'yes'
    case 'family_health':
      return c.health === 'unknown' ? 'unknown' : c.health === 'family' ? 'yes' : 'no'
    case 'bonus':
      return tri(c.bonus)
    case 'gratuity':
      return tri(c.pfGratuity)
    case 'wfh':
      return tri(c.wfh)
    case 'learning':
      return tri(c.learningBudget)
    case 'housing':
      return tri(c.housing)
    case 'transport':
      return tri(c.transport)
    case 'flights':
      return tri(c.flights)
    case 'leave':
      return c.leaveDays === null ? 'unknown' : c.leaveDays > 0 ? 'yes' : 'no'
    case 'visa':
    case 'relocation':
      // You already live and work where your current job is.
      return 'n/a'
  }
}

const SIDE_TEXT: Readonly<Record<Side, string>> = { yes: 'Yes', no: 'No', unknown: 'Unknown', 'n/a': 'Not needed' }

function leaveVerdict(current: number | null, job: PostingBenefit | undefined): Verdict {
  if (!job || job.value === 'no') return job ? 'worse' : 'unknown'
  if (current === null || job.days === undefined) return 'unknown'
  if (job.days >= current + 2) return 'better'
  if (job.days <= current - 2) return 'worse'
  return 'same'
}

function verdictOf(cur: Side, job: Side, key: BenefitKey): Verdict {
  if (job === 'unknown') return 'unknown'
  if (cur === 'n/a') return job === 'yes' ? (key === 'relocation' ? 'better' : 'same') : 'worse'
  if (cur === 'unknown') return 'unknown'
  if (cur === job) return 'same'
  return job === 'yes' ? 'better' : 'worse'
}

export interface ChecklistInput {
  posting: PostingBenefits
  current: CurrentBenefits | null
  /** The job needs a move (another country): visa and relocation rows apply. */
  abroad: boolean
}

/** Rows to show: visa and relocation only when relevant (abroad, or the posting mentions them). */
export function benefitChecklist(input: ChecklistInput): ChecklistRow[] {
  const { posting, current, abroad } = input
  return BENEFIT_KEYS.filter((k) => (k === 'visa' || k === 'relocation' ? abroad || posting[k] !== undefined : true)).map(
    (key): ChecklistRow => {
      const jobBenefit = posting[key]
      const job: Side = jobBenefit?.value ?? 'unknown'
      const cur: Side = current ? currentSide(key, current) : 'unknown'
      const verdict = key === 'leave' && current ? leaveVerdict(current.leaveDays, jobBenefit) : verdictOf(cur, job, key)
      const jobText = key === 'leave' && jobBenefit?.days ? `${jobBenefit.days} days` : SIDE_TEXT[job]
      const curText = key === 'leave' && current?.leaveDays ? `${current.leaveDays} days` : SIDE_TEXT[cur]
      return { key, label: BENEFIT_LABELS[key], current: curText, job: jobText, verdict, source: jobBenefit?.source ?? null }
    },
  )
}

const VERDICT_EFFECT: Readonly<Record<Verdict, number>> = { better: 1, same: 0, worse: -1, unknown: 0 }

/**
 * Benefits score vs the 50 baseline: 50 + 50 × (better − worse) / known
 * rows. Unknown rows are left out; with none known the score is unknown.
 */
export function benefitsCriterion(rows: readonly ChecklistRow[]): CriterionResult {
  const known = rows.filter((r) => r.verdict !== 'unknown')
  const drafts: EvidenceDraft[] = rows.map((r) => ({
    text: `${r.label}: ${r.job} here vs ${r.current} now (${r.verdict})`,
    shared: `${r.label}: ${r.job} in the posting (${r.verdict === 'unknown' ? 'not comparable yet' : `${r.verdict} than now`})`,
    effect: 0,
    confidence: r.verdict === 'unknown' ? 'unknown' : 'known',
    source: r.source ?? CURRENT,
  }))
  if (known.length === 0) return { criterion: 'benefits', score: null, confidence: 'unknown', evidence: withIds('benefits', drafts) }
  const net = known.reduce((s, r) => s + VERDICT_EFFECT[r.verdict], 0)
  return {
    criterion: 'benefits',
    score: clampScore(50 + (50 * net) / known.length),
    confidence: known.length >= rows.length / 2 ? 'known' : 'estimated',
    evidence: withIds('benefits', drafts),
  }
}

export function currentBenefitsCriterion(current: CurrentBenefits | null): CriterionResult {
  const any =
    current &&
    (current.health !== 'unknown' ||
      [current.bonus, current.pfGratuity, current.wfh, current.learningBudget, current.housing, current.transport, current.flights].some(
        (v) => v !== null,
      ) ||
      current.leaveDays !== null)
  if (!any) return { criterion: 'benefits', score: null, confidence: 'unknown', evidence: [] }
  return {
    criterion: 'benefits',
    score: 50,
    confidence: 'known',
    evidence: withIds('benefits', [{ text: 'Your current benefits are the baseline', effect: 0, confidence: 'known', source: CURRENT }]),
  }
}
