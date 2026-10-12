/**
 * The one reason a job card or row shows next to its Fit: why the posting
 * was filtered, that it needs a look, why its Fit is capped, or the first
 * "ranked lower" note. Board cards and list rows share it, so an uncertain
 * card never looks like a normal one (review 2026-10-10 §2.2 point 5).
 * Pure and client-safe.
 */

export type ReasonTone = 'warning' | 'neutral' | 'info'

export interface ReasonChip {
  label: string
  tone: ReasonTone
  /** Longer text for the tooltip. */
  title: string
}

export interface ReasonInput {
  status: string
  filterReason?: string | null
  notes?: { penalties?: readonly string[]; boosts?: readonly string[]; infos?: readonly string[] } | null
  /** The Fit ceiling from the Match Score ("Not your field", "Title only"…). */
  ceiling?: { score: number; reason: string } | null
  /**
   * The relevance gate sent the posting to "Needs a look" (no positive tech
   * evidence). TODO(relevance): set from the gate's review disposition once
   * lib/discovery/relevance exposes it; until then callers pass
   * `isNeedsLook()` from lib/ui/needs-look.ts, which is always false.
   */
  needsLook?: boolean
}

export const NEEDS_LOOK_LABEL = 'Needs a look'

/** The single most useful reason, or null when there is nothing to say. */
export function reasonChip(input: ReasonInput): ReasonChip | null {
  if (input.status === 'filtered' && input.filterReason) {
    return { label: input.filterReason, tone: 'warning', title: 'Why this posting was filtered out' }
  }
  if (input.needsLook) {
    return {
      label: NEEDS_LOOK_LABEL,
      tone: 'warning',
      title: 'No clear sign this is your kind of role. Open it, then keep or dismiss it.',
    }
  }
  if (input.ceiling) {
    return {
      label: input.ceiling.reason,
      tone: 'warning',
      title: `Fit is capped at ${input.ceiling.score}: ${input.ceiling.reason}`,
    }
  }
  const penalty = input.notes?.penalties?.[0]
  if (penalty) return { label: penalty, tone: 'warning', title: `Ranked lower: ${penalty}` }
  const info = input.notes?.infos?.[0]
  if (info) return { label: info, tone: 'neutral', title: info }
  return null
}
