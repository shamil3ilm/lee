import type { BigO } from '@/lib/academy/problems/schema'
import { complexityScore, type FitResult } from '@/lib/academy/runner/complexity'
import { qualityAdvice, qualityScore } from '@/lib/academy/runner/quality'
import type { QualityMetrics } from '@/lib/academy/runner/quality-types'
import { passRate, VERDICT_LABELS, type Judgement } from '@/lib/academy/runner/verdict'
import { timeScore } from './choice'
import { capImprovements, notApplicable, type AttemptEvaluation, type Axis, type EvaluationAxis } from './types'

/**
 * The coding evaluator (v13 §4, phase 13.1). One Submit becomes one attempt
 * scored on correctness (hidden tests), time vs par, the empirical complexity
 * fit against the target class, code quality and effectiveness (hints and
 * earlier wrong submissions). Correctness gates the composite: a rejected
 * submission earns only partial credit for the share of tests passed.
 * Performance (latency percentiles) belongs to the 13.3 simulators. Pure.
 */

export interface CodingEvaluationInput {
  judgement: Judgement
  elapsedSec: number
  parSec: number
  hintsUsed: number
  /** Submissions on this problem before this one (any verdict). */
  priorSubmissions: number
  target: { time: BigO; space: BigO }
  /** Null when the problem has no scaled inputs or the run was not accepted. */
  fit: FitResult | null
  /**
   * The problem has scaled inputs but the timing run could not finish a
   * curve because calls were too slow (its timeout, or too few points):
   * graded as worse than the target rather than skipped.
   */
  tooSlow?: boolean
  /** Visible samples among the judged cases (the rest are hidden). */
  visibleCount?: number
  quality: QualityMetrics | null
}

/** Score for a solution too slow to time at the scaled sizes. */
export const TOO_SLOW_SCORE = 25
export const TOO_SLOW_LABEL = 'too slow to time'

const WEIGHTS: Readonly<Partial<Record<EvaluationAxis, number>>> = {
  correctness: 0.5,
  complexity: 0.15,
  quality: 0.15,
  time: 0.1,
  effectiveness: 0.1,
}

/** Composite share for a submission that was not accepted (scaled by pass rate). */
const PARTIAL_COMPOSITE = 0.3
/** Glicko outcome for a rejected submission at a 100% pass rate (never a win). */
const PARTIAL_OUTCOME = 0.4

function effectiveness(hintsUsed: number, priorSubmissions: number): number {
  return Math.max(0, 100 - 20 * hintsUsed - 10 * Math.min(4, priorSubmissions))
}

function complexityAxis(input: CodingEvaluationInput): Axis<{ measuredTime: string; measuredSpace: string; targetTime: string; targetSpace: string }> {
  if (input.judgement.verdict !== 'accepted') return notApplicable('Measured only for accepted submissions')
  if (input.tooSlow) {
    return {
      status: 'scored',
      score: TOO_SLOW_SCORE,
      detail: { measuredTime: TOO_SLOW_LABEL, measuredSpace: 'not measured', targetTime: input.target.time, targetSpace: input.target.space },
    }
  }
  if (!input.fit) return notApplicable('This problem has no scaled inputs to time')
  if (input.fit.label === 'unknown') return notApplicable('Too few timing points to fit a curve')
  return {
    status: 'scored',
    score: complexityScore(input.fit.label, input.target.time),
    detail: { measuredTime: input.fit.label, measuredSpace: 'not measured', targetTime: input.target.time, targetSpace: input.target.space },
  }
}

function weighted(axes: Partial<Record<EvaluationAxis, Axis<unknown>>>): number {
  let total = 0
  let weight = 0
  for (const [axis, w] of Object.entries(WEIGHTS) as Array<[EvaluationAxis, number]>) {
    const a = axes[axis]
    if (a?.status !== 'scored') continue
    total += a.score * w
    weight += w
  }
  return weight === 0 ? 0 : total / weight
}

function improvements(input: CodingEvaluationInput, complexity: Axis<unknown>): string[] {
  const j = input.judgement
  const out: string[] = []
  if (j.verdict === 'compile_error') out.push('Fix the compile error first; Run checks the samples without counting a submission.')
  else if (j.verdict === 'time_limit') out.push('A case hit the time limit: look for repeated work inside loops, or a loop that never ends.')
  else if (j.verdict === 'runtime_error') out.push('A case threw an error: check empty inputs, missing keys and index bounds.')
  else if (j.verdict === 'wrong_answer') {
    out.push(
      j.failed?.kind === 'hidden'
        ? `Hidden case ${j.failed.index} failed. Re-read the constraints for an edge case you have not covered (empty, single item, ties, negatives).`
        : 'A sample failed: compare your output with the expected value in the Result tab.',
    )
  }
  if (complexity.status === 'scored' && complexity.detail && complexity.score < 100) {
    const d = complexity.detail as { measuredTime: string; targetTime: string }
    out.push(`Timing looks like ${d.measuredTime}; the target is ${d.targetTime}. ${input.hintsUsed === 0 ? 'The hints point at the faster idea.' : ''}`.trim())
  }
  if (j.verdict === 'accepted' && input.quality) out.push(...qualityAdvice(input.quality))
  return capImprovements(out)
}

export function evaluateCoding(input: CodingEvaluationInput): AttemptEvaluation {
  const j = input.judgement
  const accepted = j.verdict === 'accepted'
  const elapsedSec = Math.max(0, Math.round(input.elapsedSec))
  const correctness: AttemptEvaluation['correctness'] = {
    status: 'scored',
    score: accepted ? 100 : passRate(j),
    detail: { passed: j.passed, total: j.total, hiddenPassed: Math.max(0, j.passed - (input.visibleCount ?? 0)) },
  }
  const time: AttemptEvaluation['time'] = { status: 'scored', score: timeScore(elapsedSec, input.parSec), detail: { elapsedSec, parSec: input.parSec } }
  const complexity = complexityAxis(input)
  const quality: AttemptEvaluation['quality'] =
    input.quality && j.verdict !== 'compile_error'
      ? {
          status: 'scored',
          score: qualityScore(input.quality),
          detail: { cyclomatic: input.quality.cyclomatic, maxFnLength: input.quality.maxFnLength, nesting: input.quality.nesting },
        }
      : notApplicable(j.verdict === 'compile_error' ? 'The code did not compile' : 'Not measured for this language')
  const eff = effectiveness(input.hintsUsed, input.priorSubmissions)
  const effectivenessAxis: AttemptEvaluation['effectiveness'] = {
    status: 'scored',
    score: eff,
    detail: {
      attempts: input.priorSubmissions + 1,
      hintsUsed: input.hintsUsed,
      approachOptimal: accepted && (complexity.status !== 'scored' || complexity.score === 100),
    },
  }
  const axes = { correctness, time, complexity, quality, effectiveness: effectivenessAxis }
  const composite = accepted ? Math.round(weighted(axes)) : Math.round(PARTIAL_COMPOSITE * passRate(j))
  const outcome = accepted ? 1 : Math.round(PARTIAL_OUTCOME * passRate(j)) / 100
  return {
    v: 1,
    format: 'coding',
    correctness,
    time,
    complexity,
    performance: notApplicable('Latency percentiles come with the scenario simulators'),
    quality,
    effectiveness: effectivenessAxis,
    composite,
    outcome,
    improvements: improvements(input, complexity),
  }
}

export function verdictHeadline(j: Pick<Judgement, 'verdict' | 'passed' | 'total'>): string {
  return `${VERDICT_LABELS[j.verdict]} · ${j.passed}/${j.total} tests`
}
