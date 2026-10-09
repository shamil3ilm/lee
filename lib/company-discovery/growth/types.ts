/**
 * Company growth score: client-safe types. Every signal is deterministic,
 * explainable and free to compute; each carries its source, date and
 * confidence. A signal lee could not measure is `score: null` (unknown): it
 * lowers the confidence of the result, never the score.
 */

export const GROWTH_SIGNALS = ['hiring', 'news', 'engineering', 'headcount', 'stage', 'momentum', 'tailwind'] as const
export type GrowthSignalKind = (typeof GROWTH_SIGNALS)[number]

export type Confidence = 'high' | 'medium' | 'low'

export const CONFIDENCE_FACTOR: Readonly<Record<Confidence, number>> = { high: 1, medium: 0.7, low: 0.4 }

/**
 * Weights of the known signals in the weighted mean (they add up to 100).
 * Rate and trend signals measured against the company's own baseline carry
 * the weight; nothing here counts fame (Wikidata presence, press volume,
 * stars, a YC badge).
 */
export const GROWTH_WEIGHTS: Readonly<Record<GrowthSignalKind, number>> = {
  hiring: 30,
  news: 18,
  engineering: 17,
  headcount: 13,
  stage: 9,
  momentum: 6,
  tailwind: 7,
}

export const GROWTH_LABELS: Readonly<Record<GrowthSignalKind, string>> = {
  hiring: 'Hiring velocity',
  news: 'Funding and expansion news',
  engineering: 'Engineering activity',
  headcount: 'Headcount trend',
  stage: 'Stage and age',
  momentum: 'Product momentum',
  tailwind: 'Market tailwind',
}

export interface GrowthSignal {
  kind: GrowthSignalKind
  /** 0–100 (50 = flat); null = unknown (not measured, or not enough data). */
  score: number | null
  /** One line for the popover: what was measured. */
  detail: string
  /** Where it comes from ("ATS board (Greenhouse), weekly counts"). */
  source: string
  /** yyyy-mm-dd of the newest data point, when there is one. */
  date: string | null
  confidence: Confidence
  url?: string
}

export interface GrowthResult {
  /** 0–100, or null when no company-specific signal is known. */
  score: number | null
  confidence: Confidence
  signals: GrowthSignal[]
}

/** Minimum-growth filter steps in Discovery › Companies. */
export const MIN_GROWTH_STEPS = [40, 50, 60, 70, 80] as const
