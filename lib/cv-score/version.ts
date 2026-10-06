/**
 * v12.0 — scorer version. Stored on every `cv_scores` row so scores from
 * different rule sets are never compared as if equal.
 *
 * Bump rules: ANY change that alters a score or finding for the same input
 * (weights, thresholds, word lists, synonym map, grade bands) bumps this.
 * Pure refactors and UI changes don't.
 *
 * 1.1.0 — text CVs: company above/below the date line, wrapped bullets
 *         joined, project paragraphs as bullets, hyperlinks as contact
 *         details; weighted engineering years (internships at half,
 *         non-engineering roles excluded); chronology flags only real
 *         inversions; prose-only keyword stuffing; region-aware phone and
 *         page-length advice; scope vs outcome numbers; impact recalibrated
 *         (outcome component, weak openers weigh double); findings cite lines.
 */
export const SCORER_VERSION = '1.1.0'

/**
 * True when a stored score was computed by an older rule set — the UI shows
 * it as an older-version score and doesn't compare it with current ones.
 */
export function isOutdatedScore(scorerVersion: string | null | undefined): boolean {
  return !!scorerVersion && scorerVersion !== SCORER_VERSION
}
