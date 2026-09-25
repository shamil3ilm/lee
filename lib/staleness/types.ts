// v9 — State Freshness Guard (SFG) types. See
// `docs/superpowers/specs/2026-09-25-employ-v9-state-freshness-guard-design.md`
// for the design rationale.
//
// A StateSnapshot lives inside `documents.content.stateSnapshot`. It records
// two things: (1) a per-source-record hash so cheap comparison is possible,
// and (2) a small `fields` bag for human-readable diffs. We deliberately do
// NOT hash large blobs like `description_md` — the hash gives the strict
// comparison and `fields` carries only what the UI needs to render a diff.

/**
 * Serializable subset of state at the moment an AI-generated document was
 * produced. Every generator writes this at persist time; the check util
 * rebuilds a "current" snapshot from live DB state and compares.
 */
export interface StateSnapshot {
  /** Wall-clock at generation, ISO-8601 UTC. */
  capturedAt: string
  /** Named hashes of source records (e.g. `application`, `job`, `master_cv`). */
  hashes: Record<string, string>
  /** Small, comparable fields the UI can use to describe drift. */
  fields: Record<string, unknown>
}

/**
 * Severity of drift between snapshot and current state, per spec §5.
 * - `critical`: material change — regenerate before consuming
 * - `minor`:    cosmetic change — regenerate encouraged, not required
 * - `fresh`:    no material drift (or no snapshot at all — treated as fresh)
 */
export type Severity = 'critical' | 'minor' | 'fresh'

/**
 * Full result of `checkDocumentStaleness`. `changedFields` is a list of
 * human-friendly labels (e.g. `application.status`); `summary` is a one-line
 * narrative the UI can show inline.
 */
export interface StalenessResult {
  severity: Severity
  changedFields: string[]
  summary: string
  currentSnapshot: StateSnapshot
  /**
   * Null when the document predates v9 — no snapshot recorded, so we cannot
   * say anything definitive about drift. Handlers should treat this as
   * `fresh` and skip the banner.
   */
  previousSnapshot: StateSnapshot | null
}
