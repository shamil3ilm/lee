import { CONFIDENCE_FACTOR, GROWTH_WEIGHTS, type Confidence, type GrowthResult, type GrowthSignal } from './types'

/**
 * Combine the signals into a growth score 0–100 and a confidence.
 *
 *   score       weighted mean of the KNOWN signals only (GROWTH_WEIGHTS);
 *               unknown signals are left out, never counted as zero. Null
 *               when nothing company-specific is known (the market
 *               tailwind alone says nothing about the company).
 *   confidence  coverage q = Σ weight × confidence factor (high 1, medium
 *               0.7, low 0.4) over the known signals, ÷ 100:
 *               high   q ≥ 0.45 and 3+ company-specific signals known
 *               medium q ≥ 0.2  or 2+ company-specific signals known
 *               low    otherwise
 * Pure, client-safe.
 */

const COMPANY_SPECIFIC = new Set(['hiring', 'news', 'engineering', 'headcount', 'stage', 'momentum'])

export function combineGrowth(signals: readonly GrowthSignal[]): GrowthResult {
  const known = signals.filter((s) => s.score !== null)
  const specific = known.filter((s) => COMPANY_SPECIFIC.has(s.kind))
  if (specific.length === 0) return { score: null, confidence: 'low', signals: [...signals] }
  const weight = known.reduce((w, s) => w + GROWTH_WEIGHTS[s.kind], 0)
  const score = Math.round(known.reduce((sum, s) => sum + GROWTH_WEIGHTS[s.kind] * (s.score as number), 0) / weight)
  const q = known.reduce((sum, s) => sum + GROWTH_WEIGHTS[s.kind] * CONFIDENCE_FACTOR[s.confidence], 0) / 100
  const confidence: Confidence = q >= 0.45 && specific.length >= 3 ? 'high' : q >= 0.2 || specific.length >= 2 ? 'medium' : 'low'
  return { score: Math.max(0, Math.min(100, score)), confidence, signals: [...signals] }
}

/** "Growth 78 · high confidence" / "Growth unknown". */
export function growthChipText(score: number | null, confidence: Confidence | null): string {
  if (score === null || !confidence) return 'Growth unknown'
  return `Growth ${score} · ${confidence} confidence`
}

/**
 * Points the growth adds to company fit (0…10, see fit.ts): a known score
 * maps to score ÷ 10, pulled toward the neutral 5 by its confidence (high
 * full, medium 0.7, low 0.4). Unknown growth is the neutral 5: missing data
 * never pushes a company down.
 */
export function growthFitPoints(score: number | null, confidence: Confidence | null): number {
  if (score === null || !confidence) return 5
  return Math.round(5 + (score / 10 - 5) * CONFIDENCE_FACTOR[confidence])
}

/**
 * The Fit nudge on job cards when "Factor company growth into Fit" is on:
 * −5…+5 from the employer's growth, only at medium or high confidence.
 */
export function growthFitNudge(score: number | null, confidence: string | null): number {
  if (score === null || (confidence !== 'high' && confidence !== 'medium')) return 0
  const x = (score - 50) / 10
  // Half away from zero, as SQL round() in growthNudgeSql does.
  return Math.max(-5, Math.min(5, Math.sign(x) * Math.round(Math.abs(x)))) + 0
}
