import { formatPay, parsePostedPay, type PostedPay } from '@/lib/discovery/relevance/pay'
import { clampScore, unknownCriterion, withIds, type Confidence, type CriterionResult, type EvidenceDraft } from './evidence'
import { convertMoney, formatMoney } from './fx'
import type { OpportunityInput } from './inputs'
import { BASIS_LABELS, payRatio, takeHome, type PayBasis, type TakeHome } from './take-home'
import type { Assumptions, CompareCurrency, CurrentJob, FloatingCurrency, Place } from './types'

/**
 * Pay criterion. The posting's stated range is converted to the current
 * job's currency (pegs, or the user's FX table), shown per month and per
 * year, then compared as an estimated take-home. Unknown pay stays unknown.
 *
 * Score: the current job is the 50 baseline; the job scores
 * 50 + 50 × log2(ratio), so +100% → 100 and −50% → 0.
 */

export interface PayRange {
  min: number
  max: number
}

export interface PayView {
  currency: CompareCurrency
  /** As the posting states it ("AED 18,000–22,000/mo"); null = not stated. */
  postedText: string | null
  monthly: PayRange | null
  annual: PayRange | null
  conversionLabel: string | null
  conversionConfidence: Confidence
  /** The floating currency missing from the FX table, when that blocked it. */
  missingFx: FloatingCurrency | null
  job: TakeHome | null
  current: TakeHome | null
  deltaPct: number | null
  basis: PayBasis | null
}

export interface PayOutcome {
  result: CriterionResult
  view: PayView
}

function postedText(p: PostedPay): string {
  const lo = p.min ?? p.max ?? 0
  const hi = p.max ?? lo
  return lo === hi ? formatPay(hi, p.currency, p.period) : `${formatPay(lo, p.currency, p.period)} – ${formatPay(hi, p.currency, p.period)}`
}

function emptyView(currency: CompareCurrency, posted: string | null): PayView {
  return {
    currency,
    postedText: posted,
    monthly: null,
    annual: null,
    conversionLabel: null,
    conversionConfidence: 'unknown',
    missingFx: null,
    job: null,
    current: null,
    deltaPct: null,
    basis: null,
  }
}

function postingSource(job: OpportunityInput): EvidenceDraft['source'] {
  return job.salary && (job.salary.min || job.salary.max)
    ? { kind: 'job_details', label: 'Salary field on the posting' }
    : { kind: 'posting', label: 'Posting' }
}

function currentTakeHome(current: CurrentJob, a: Assumptions): TakeHome | null {
  if (current.monthlyGross === null || current.place === null) return null
  return takeHome({
    grossMonthly: current.monthlyGross,
    currency: current.currency,
    place: current.place,
    housingProvided: current.benefits.housing === true,
    assumptions: a,
  })
}

export function payCriterion(input: {
  job: OpportunityInput
  current: CurrentJob | null
  assumptions: Assumptions
  jobPlace: Place | null
  housingProvided: boolean
}): PayOutcome {
  const { job, current, assumptions: a } = input
  const currency: CompareCurrency = current?.currency ?? 'INR'
  const posted = parsePostedPay({ salary: job.salary, description: job.description })
  if (!posted) {
    return {
      result: unknownCriterion('pay', [
        { text: 'The posting states no pay.', effect: 0, confidence: 'unknown', source: { kind: 'posting', label: 'Posting' } },
      ]),
      view: emptyView(currency, null),
    }
  }
  const text = postedText(posted)
  const toMonth = posted.period === 'year' ? 1 / 12 : 1
  const lo = (posted.min ?? posted.max ?? 0) * toMonth
  const hi = (posted.max ?? posted.min ?? 0) * toMonth
  const cLo = convertMoney(lo, posted.currency, currency, a.fx)
  const cHi = convertMoney(hi, posted.currency, currency, a.fx)
  const drafts: EvidenceDraft[] = [{ text: `Stated pay: ${text}`, effect: 0, confidence: 'known', source: postingSource(job) }]
  if (cLo.amount === null || cHi.amount === null) {
    const missing = cLo.missing ?? cHi.missing
    drafts.push({
      text: missing ? `No ${missing} rate in your FX table, so it can't be converted to ${currency}.` : `Can't convert ${posted.currency} to ${currency}.`,
      effect: 0,
      confidence: 'unknown',
      source: cLo.source ?? { kind: 'fx_table', label: 'Your FX table' },
    })
    return {
      result: { criterion: 'pay', score: null, confidence: 'unknown', evidence: withIds('pay', drafts) },
      view: { ...emptyView(currency, text), missingFx: missing },
    }
  }
  const monthly = { min: cLo.amount, max: cHi.amount }
  const annual = { min: monthly.min * 12, max: monthly.max * 12 }
  if (cLo.source) {
    drafts.push({
      text: `≈ ${formatMoney(monthly.min, currency)}–${formatMoney(monthly.max, currency).replace(`${currency} `, '')}/mo`,
      effect: 0,
      confidence: cLo.confidence,
      source: cLo.source,
    })
  }
  const mid = (monthly.min + monthly.max) / 2
  const jobTH = input.jobPlace
    ? takeHome({ grossMonthly: mid, currency, place: input.jobPlace, housingProvided: input.housingProvided, assumptions: a })
    : null
  const curTH = current ? currentTakeHome(current, a) : null
  const view: PayView = {
    currency,
    postedText: text,
    monthly,
    annual,
    conversionLabel: cLo.source?.label ?? null,
    conversionConfidence: cLo.confidence,
    missingFx: null,
    job: jobTH,
    current: curTH,
    deltaPct: null,
    basis: null,
  }
  const ratio = jobTH && curTH ? payRatio(jobTH, curTH) : null
  if (!ratio || ratio.ratio <= 0) {
    drafts.push({
      text: !current?.monthlyGross
        ? 'Add your current pay to compare.'
        : 'Set where both jobs are to compare take-home.',
      effect: 0,
      confidence: 'unknown',
      source: { kind: 'current_job', label: 'Your current job' },
    })
    return { result: { criterion: 'pay', score: null, confidence: 'unknown', evidence: withIds('pay', drafts) }, view }
  }
  const deltaPct = Math.round((ratio.ratio - 1) * 100)
  drafts.push({
    text: `${deltaPct >= 0 ? '+' : ''}${deltaPct}% ${BASIS_LABELS[ratio.basis]} vs your current job (estimate)`,
    // The percentage plus the posted range would let a model back out the current salary.
    shared: `Estimated ${BASIS_LABELS[ratio.basis]} is ${deltaPct > 2 ? 'higher than' : deltaPct < -2 ? 'lower than' : 'about the same as'} now`,
    effect: 0,
    confidence: 'estimated',
    source: { kind: 'assumptions', label: 'Your current job and assumptions' },
  })
  return {
    result: {
      criterion: 'pay',
      score: clampScore(50 + 50 * Math.log2(ratio.ratio)),
      confidence: 'estimated',
      evidence: withIds('pay', drafts),
    },
    view: { ...view, deltaPct, basis: ratio.basis },
  }
}

/** The current job's pay: the 50 baseline once its pay is entered. */
export function currentPayCriterion(current: CurrentJob | null): CriterionResult {
  if (!current?.monthlyGross) return unknownCriterion('pay')
  return {
    criterion: 'pay',
    score: 50,
    confidence: 'known',
    evidence: withIds('pay', [
      {
        text: `${formatMoney(current.monthlyGross, current.currency)}/mo gross is the baseline`,
        effect: 0,
        confidence: 'known',
        source: { kind: 'current_job', label: 'Your current job' },
      },
    ]),
  }
}
