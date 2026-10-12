/**
 * Seam for the relevance gate's "Needs a look" group (postings with no
 * positive tech evidence, kept out of New). The UI reads it through these
 * two helpers so it can light up without touching every surface again.
 *
 * TODO(relevance): the gate work in lib/discovery/relevance decides how a
 * "Needs a look" posting is stored (a status or a relevance_notes flag).
 * Replace the bodies below with that rule, and wire `countNeedsLook` in
 * lib/discovery/needs-look-count.ts to the matching query. Until then
 * nothing is in the group: the badge, the subtitle part and the card chip
 * stay hidden.
 */

export interface NeedsLookRow {
  status: string
  relevanceNotes?: unknown
}

/** True when the posting belongs in "Needs a look" (always false until the gate ships it). */
export function isNeedsLook(_row: NeedsLookRow): boolean {
  return false
}
