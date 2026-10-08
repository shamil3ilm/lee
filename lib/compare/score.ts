import { CRITERIA, type Criterion } from './types'

/**
 * Weighted total over the KNOWN criteria only: Σ w·s / Σ w. Unknown
 * criteria are left out (never counted as zero) and lower the coverage
 * instead, which the UI shows next to the total. Pure and client-safe, so
 * the side-by-side page re-sorts as the user edits weights.
 */

export interface WeightedTotal {
  score: number | null
  /** Share of the total weight that is known, 0–1. */
  coverage: number
}

export type CriterionScores = Readonly<Record<Criterion, number | null>>

export function weightedTotal(scores: CriterionScores, weights: Readonly<Record<Criterion, number>>): WeightedTotal {
  let sum = 0
  let known = 0
  let all = 0
  for (const c of CRITERIA) {
    const w = Math.max(0, weights[c] ?? 0)
    all += w
    const s = scores[c]
    if (s === null || w === 0) continue
    sum += w * s
    known += w
  }
  return { score: known > 0 ? Math.round(sum / known) : null, coverage: all > 0 ? Math.round((known / all) * 100) / 100 : 0 }
}

/** Sort keys by weighted total, best first; unknown totals last, then by coverage. */
export function rankByTotal<T extends { key: string; scores: CriterionScores }>(
  items: readonly T[],
  weights: Readonly<Record<Criterion, number>>,
): Array<T & { total: WeightedTotal }> {
  return items
    .map((i) => ({ ...i, total: weightedTotal(i.scores, weights) }))
    .sort((a, b) => {
      const sa = a.total.score ?? -1
      const sb = b.total.score ?? -1
      if (sb !== sa) return sb - sa
      if (b.total.coverage !== a.total.coverage) return b.total.coverage - a.total.coverage
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    })
}
