import { createHash } from 'node:crypto'

/**
 * v10.1 — content-addressable identifier for a prompt string. First 12 chars
 * of a sha256 hex digest (≈ 48 bits of entropy — collision-safe for the
 * tens-of-thousands-of-calls scale of a personal job tracker while staying
 * short enough to eyeball in analytics).
 *
 * Used alongside `promptVersion` (semver, bumped by humans on intentional
 * prompt edits) so we can:
 *  - detect silent drift (VERSION unchanged but hash moved → someone edited
 *    a prompt without bumping the version)
 *  - roll up ratings per (kind, promptVersion) to see which iteration is
 *    performing better
 *  - re-run the eval suite when the hash changes and warn if snapshots
 *    diverge for the same fixture
 *
 * Deterministic and pure: same input → same output, no I/O.
 */
export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 12)
}
