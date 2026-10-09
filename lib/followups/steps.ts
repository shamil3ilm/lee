/**
 * Follow-up steps (client-safe, no imports): 1 = check-in, 2 = final note.
 * The cadence that decides when each is due is in ./cadence.ts.
 */

export const FOLLOWUP_STEPS = [1, 2] as const
export type FollowupStep = (typeof FOLLOWUP_STEPS)[number]

export function isFollowupStep(v: unknown): v is FollowupStep {
  return v === 1 || v === 2
}

/**
 * The step a stored follow-up draft covered: its `followupStep`, else (drafts
 * from the old 7/14/21/30 cadence) day 14 or later counts as the second.
 */
export function stepOfDraft(content: { followupStep?: unknown; daysSince?: unknown }): FollowupStep | null {
  if (isFollowupStep(content.followupStep)) return content.followupStep
  const d = content.daysSince
  if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) return null
  return d >= 14 ? 2 : 1
}
