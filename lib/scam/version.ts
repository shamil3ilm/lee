/**
 * v17 §1 — Scam Shield rules version. Stored on every
 * `job_risk_assessments` row; a row whose version differs from this one is
 * stale and gets re-assessed (see lib/scam/service.ts `reassessStale`).
 *
 * Bump rules: ANY change that can alter a score, level or signal for the
 * same input (patterns, weights, thresholds, word lists) bumps this.
 */
export const RULES_VERSION = 'scam-1.0.0'

/** Level thresholds on the 0–100 score. */
export const CAUTION_AT = 25
export const LIKELY_SCAM_AT = 55
