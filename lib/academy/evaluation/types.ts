import type { Item, ItemFormat } from '@/lib/academy/content/schema'

/**
 * The multi-axis evaluation every attempt gets (v13 §4). An axis a format
 * cannot measure is explicitly "n/a" with a reason, never a fake score.
 * Stored compactly in `academy_attempts.evaluation` (capped jsonb). Pure.
 */

export type Axis<T> = { status: 'scored'; score: number; detail: T | null } | { status: 'n/a'; reason: string }

export interface CorrectnessDetail {
  passed: number
  total: number
  hiddenPassed: number
}
export interface TimeDetail {
  elapsedSec: number
  parSec: number
}
export interface ComplexityDetail {
  measuredTime: string
  measuredSpace: string
  targetTime: string
  targetSpace: string
}
export interface PerformanceDetail {
  p50Ms: number
  p95Ms: number
  p99Ms: number
  budgetMs: number
}
export interface QualityDetail {
  cyclomatic: number
  maxFnLength: number
  nesting: number
}
export interface EffectivenessDetail {
  attempts: number
  hintsUsed: number
  approachOptimal: boolean
}

export const EVALUATION_AXES = ['correctness', 'time', 'complexity', 'performance', 'quality', 'effectiveness'] as const
export type EvaluationAxis = (typeof EVALUATION_AXES)[number]

export const AXIS_LABELS: Readonly<Record<EvaluationAxis, string>> = {
  correctness: 'Correctness',
  time: 'Time vs par',
  complexity: 'Complexity',
  performance: 'Performance',
  quality: 'Code quality',
  effectiveness: 'Effectiveness',
}

export interface AttemptEvaluation {
  /** Shape version of this object. */
  v: 1
  format: ItemFormat
  correctness: Axis<CorrectnessDetail>
  time: Axis<TimeDetail>
  complexity: Axis<ComplexityDetail>
  performance: Axis<PerformanceDetail>
  quality: Axis<QualityDetail>
  effectiveness: Axis<EffectivenessDetail>
  /** 0–100, weighted by format. */
  composite: number
  /** 0–1 game result fed to the rating update. */
  outcome: number
  /** Concrete next steps. */
  improvements: string[]
}

export interface EvaluationContext {
  elapsedSec: number
  hintsUsed: number
}

/** One exercise format's scorer. 13.1+ formats (runners) implement the same interface. */
export interface Evaluator<S> {
  formats: readonly ItemFormat[]
  parseSubmission(raw: unknown, item?: Item): S | null
  evaluate(item: Item, submission: S, ctx: EvaluationContext): AttemptEvaluation
}

export function notApplicable<T>(reason: string): Axis<T> {
  return { status: 'n/a', reason }
}

const MAX_IMPROVEMENTS = 4
const MAX_IMPROVEMENT_CHARS = 400

/** Cap the free text so a row stays small on Neon. */
export function capImprovements(list: readonly string[]): string[] {
  return list.slice(0, MAX_IMPROVEMENTS).map((s) => (s.length > MAX_IMPROVEMENT_CHARS ? `${s.slice(0, MAX_IMPROVEMENT_CHARS - 1)}…` : s))
}

function slimAxis<T>(a: Axis<T>): Axis<T> {
  return a.status === 'scored' ? { status: 'scored', score: a.score, detail: null } : { status: 'n/a', reason: '' }
}

/** Scores only (details and advice dropped): what retention keeps for old attempts. */
export function compactEvaluation(ev: AttemptEvaluation): AttemptEvaluation {
  return {
    v: ev.v,
    format: ev.format,
    correctness: slimAxis(ev.correctness),
    time: slimAxis(ev.time),
    complexity: slimAxis(ev.complexity),
    performance: slimAxis(ev.performance),
    quality: slimAxis(ev.quality),
    effectiveness: slimAxis(ev.effectiveness),
    composite: ev.composite,
    outcome: ev.outcome,
    improvements: [],
  }
}

/** Lenient read of a stored evaluation (null when missing or not this shape). */
export function readEvaluation(value: unknown): AttemptEvaluation | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<AttemptEvaluation>
  if (v.v !== 1 || typeof v.composite !== 'number' || !v.correctness) return null
  return v as AttemptEvaluation
}
