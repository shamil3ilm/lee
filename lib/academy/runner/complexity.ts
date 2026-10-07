import { BIG_O, type BigO } from '@/lib/academy/problems/constants'
import type { ScalePoint } from './protocol'

/**
 * Empirical complexity fit (v13 §4.1): timings at growing n are fitted
 * against 1, log n, n, n log n and n² by least squares on log-log (one scale
 * constant per model: ln t = ln c + ln f(n)), and the model with the smallest
 * residual wins. Pure and deterministic, so it is unit-tested on synthetic
 * timings.
 */

export type MeasuredComplexity = BigO | 'unknown'

const MODELS: ReadonlyArray<{ label: BigO; f: (n: number) => number }> = [
  { label: 'O(1)', f: () => 1 },
  { label: 'O(log n)', f: (n) => Math.log2(n) },
  { label: 'O(n)', f: (n) => n },
  { label: 'O(n log n)', f: (n) => n * Math.log2(n) },
  { label: 'O(n^2)', f: (n) => n * n },
]

export const MIN_POINTS = 4

export interface FitResult {
  label: MeasuredComplexity
  /** Residual variance of the winning model in log space (lower is a better fit). */
  residual: number
  /** Log-log slope of the timings (≈0 constant, ≈1 linear, ≈2 quadratic). */
  slope: number
}

function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

function variance(xs: readonly number[]): number {
  const m = mean(xs)
  return mean(xs.map((x) => (x - m) ** 2))
}

function slopeOf(points: readonly ScalePoint[]): number {
  const xs = points.map((p) => Math.log(p.n))
  const ys = points.map((p) => Math.log(p.ms))
  const mx = mean(xs)
  const my = mean(ys)
  const num = xs.reduce((s, x, i) => s + (x - mx) * ((ys[i] as number) - my), 0)
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  return den === 0 ? 0 : num / den
}

/**
 * Below this many ms per call at the largest n, timings are timer noise:
 * the call is effectively constant time.
 */
const NOISE_FLOOR_MS = 0.002

export function fitComplexity(points: readonly ScalePoint[]): FitResult {
  const usable = points.filter((p) => p.n > 1 && Number.isFinite(p.ms) && p.ms > 0)
  if (usable.length < MIN_POINTS) {
    const largest = points.reduce((m, p) => Math.max(m, p.ms), 0)
    // Every call too fast to time at every size: constant (or close to it).
    if (points.length >= MIN_POINTS && largest < NOISE_FLOOR_MS) return { label: 'O(1)', residual: 0, slope: 0 }
    return { label: 'unknown', residual: Number.POSITIVE_INFINITY, slope: 0 }
  }
  const slope = slopeOf(usable)
  let best: FitResult = { label: 'unknown', residual: Number.POSITIVE_INFINITY, slope }
  for (const m of MODELS) {
    const residual = variance(usable.map((p) => Math.log(p.ms) - Math.log(m.f(p.n))))
    if (residual < best.residual - 1e-12) best = { label: m.label, residual, slope }
  }
  return best
}

export function bigORank(label: BigO): number {
  return BIG_O.indexOf(label)
}

/** Adjacent classes the timer cannot reliably separate. */
function withinNoise(measured: BigO, target: BigO): boolean {
  return (
    (target === 'O(1)' && measured === 'O(log n)') ||
    (target === 'O(n)' && measured === 'O(n log n)') ||
    (target === 'O(log n)' && measured === 'O(1)')
  )
}

/** 100 at or below the target class; one class worse 60 (85 within timer noise); worse 25. */
export function complexityScore(measured: BigO, target: BigO): number {
  const gap = bigORank(measured) - bigORank(target)
  if (gap <= 0) return 100
  if (gap === 1) return withinNoise(measured, target) ? 85 : 60
  return 25
}
