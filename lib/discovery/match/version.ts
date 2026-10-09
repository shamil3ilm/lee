/**
 * Version of the deterministic Match Score rules (lib/discovery/match).
 * Part of every row's `fit_key`: bump it whenever a weight, a lexicon or a
 * component rule changes, and the backfill job re-scores stored discoveries.
 */
// m3 — review 2026-10-09: nationals-only needs a phrase about candidates
// (not "Saudi National Bank"); benefit-list visa wording; any-of skill
// groups; mandatory language −25 and a weak-band ceiling; years asked read
// per must-have line and scored in proportion; title-only capped at 55.
// m4 — starred regions (lib/regions/preferred): +5 top priority / +3
// preferred in the region component.
export const MATCH_SCORE_VERSION = 'm4'
