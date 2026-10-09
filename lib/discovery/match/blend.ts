/**
 * Match + AI. Client-safe: no server imports.
 *
 * The deterministic Match Score covers every posting; the AI score is an
 * optional refinement for the postings it reached. Ranking uses ONE number:
 *
 *   ranked = Match                              when there is no AI score
 *          = AI                                 when there is no Match score yet
 *          = round(0.5 × Match + 0.5 × AI)      when both exist
 *
 * Equal weights: the AI reads the whole posting but can misjudge; the
 * Match Score is exact about what it checks but blind to the rest. The SQL
 * twin is `blendedSql` in lib/db/queries/discoveries.ts (same formula).
 */

export const BLEND_WEIGHTS = { match: 0.5, ai: 0.5 } as const

export function blendScores(match: number | null, ai: number | null): number | null {
  if (match === null && ai === null) return null
  if (ai === null) return match
  if (match === null) return ai
  return Math.round(BLEND_WEIGHTS.match * match + BLEND_WEIGHTS.ai * ai)
}

/**
 * The Fit a card shows: the blend, held under the Match detail's ceiling
 * (a mandatory language you lack → weak; title only → low confidence).
 * The SQL twin is `blendedSql` (it reads the ceiling from fit_detail).
 */
export function cappedFit(match: number | null, ai: number | null, detail: { ceiling?: { score: number } } | null | undefined): number | null {
  const fit = blendScores(match, ai)
  if (fit === null || !detail?.ceiling) return fit
  return Math.min(fit, detail.ceiling.score)
}

export type ScoreBand = 'strong' | 'good' | 'fair' | 'weak'

export const BAND_LABELS: Readonly<Record<ScoreBand, string>> = {
  strong: 'Strong fit',
  good: 'Good fit',
  fair: 'Fair fit',
  weak: 'Weak fit',
}

/** The formula as shown in "Why this score" (keep in step with blendScores). */
export const FIT_FORMULA = 'Fit = (Match + AI) ÷ 2 when both exist; otherwise whichever one there is.'

/** Colour bands: 75+ strong · 55–74 good · 35–54 fair · below 35 weak. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 75) return 'strong'
  if (score >= 55) return 'good'
  if (score >= 35) return 'fair'
  return 'weak'
}

/**
 * The one number on every card: "Fit 76" (the blend), "Fit ~45" when it
 * rests on the job title alone (no AI score to refine it), or "Not scored".
 */
export function fitText(match: number | null, ai: number | null, opts: { titleOnly?: boolean; ceiling?: number } = {}): string {
  const fit = cappedFit(match, ai, opts.ceiling === undefined ? null : { ceiling: { score: opts.ceiling } })
  if (fit === null) return 'Not scored'
  return opts.titleOnly && ai === null ? `Fit ~${fit}` : `Fit ${fit}`
}

/** "Match 72 · AI 80", "Match 72", "AI 80" or "Not scored" (the breakdown, inside the popover). */
export function scoreText(match: number | null, ai: number | null): string {
  const parts = [match !== null ? `Match ${match}` : null, ai !== null ? `AI ${ai}` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Not scored'
}
