/**
 * "Needs a look" (relevance gate r10): a recognised non-engineering title
 * with no tech evidence in its JD is kept but held out of New, flagged as
 * `relevance_notes.needsLook`. The UI reads it through this one helper so
 * the card chip, the row chip, the subtitle and the badge agree. Pure and
 * client-safe; the SQL twin is `needsLookSql()` in
 * lib/db/queries/discoveries.ts.
 */

export interface NeedsLookRow {
  status: string
  relevanceNotes?: unknown
}

/** The view that lists the group (status=review: New rows flagged needsLook). */
export const NEEDS_LOOK_HREF = '/discoveries?tab=jobs&status=review&view=list'

/** True when the posting sits in "Needs a look" (a New row the gate flagged). */
export function isNeedsLook(row: NeedsLookRow): boolean {
  if (row.status !== 'new') return false
  const notes = row.relevanceNotes
  return typeof notes === 'object' && notes !== null && (notes as { needsLook?: unknown }).needsLook === true
}
