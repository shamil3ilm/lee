/**
 * v12.0 — scorer version. Stored on every `cv_scores` row so scores from
 * different rule sets are never compared as if equal.
 *
 * Bump rules: ANY change that alters a score or finding for the same input
 * (weights, thresholds, word lists, synonym map, grade bands) bumps this.
 * Pure refactors and UI changes don't.
 */
export const SCORER_VERSION = '1.0.0'
