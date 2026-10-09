/**
 * Can public profile facts be edited in lee?
 *
 * The portfolio's profile.json is the source of truth for public profile
 * facts; lee pulls them and keeps only its own overlay (readiness, wordings,
 * link kinds, private items). While this returns false, importers produce
 * "Suggested additions for your portfolio" instead of writing public facts,
 * and Reset cannot clear public sections. Every server action that writes
 * public facts checks this too, not only the UI.
 */
export function profileEditableInLee(): boolean {
  return false
}
