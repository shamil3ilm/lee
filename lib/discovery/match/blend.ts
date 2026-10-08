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

export type ScoreBand = 'strong' | 'good' | 'fair' | 'weak'

export const BAND_LABELS: Readonly<Record<ScoreBand, string>> = {
  strong: 'Strong match',
  good: 'Good match',
  fair: 'Fair match',
  weak: 'Weak match',
}

/** Colour bands: 75+ strong · 55–74 good · 35–54 fair · below 35 weak. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 75) return 'strong'
  if (score >= 55) return 'good'
  if (score >= 35) return 'fair'
  return 'weak'
}

/** "Match 72 · AI 80", "Match 72", "AI 80" or "Not scored". */
export function scoreText(match: number | null, ai: number | null): string {
  const parts = [match !== null ? `Match ${match}` : null, ai !== null ? `AI ${ai}` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Not scored'
}
