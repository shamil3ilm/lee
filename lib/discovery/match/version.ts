/**
 * Version of the deterministic Match Score rules (lib/discovery/match).
 * Part of every row's `fit_key`: bump it whenever a weight, a lexicon or a
 * component rule changes, and the backfill job re-scores stored discoveries.
 */
export const MATCH_SCORE_VERSION = 'm2'
