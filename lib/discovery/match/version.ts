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
// m5 — eligibility (2026-10-12, the "Fit 72" SE-Asia frontend report): a
// remote role whose location names only countries you do not accept fails
// even when its hours are near yours, "Southeast Asia" no longer covers
// India/GCC; not eligible caps the Fit at 30; off-target roles get at most
// +2 domain and no strong-area seniority offset; no offset when the years
// asked are twice yours; a generic title with a JD of another family is 3.
export const MATCH_SCORE_VERSION = 'm5'
