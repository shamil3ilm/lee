import type { ApplicationStatus } from '@/lib/ui/status'

export interface FunnelCounts {
  applied: number
  screen: number
  interview: number
  offer: number
  rejected: number
  withdrawn: number
}

/**
 * Convert a per-status count map (each application in exactly one bucket) to
 * cumulative funnel counts: each active stage's number is the count of
 * applications that reached that stage OR any later one. Rejected/withdrawn
 * are passed through as exclusive terminal counts so they can be shown as a
 * footnote — they were removed from the funnel when the outcome landed.
 *
 * `saved` is intentionally excluded — the funnel starts at Applied because
 * "saved" applications haven't entered the response funnel yet.
 */
export function buildFunnelCounts(
  byStatus: Record<ApplicationStatus, number>,
): FunnelCounts {
  const applied = byStatus.applied + byStatus.screen + byStatus.interview + byStatus.offer
  const screen = byStatus.screen + byStatus.interview + byStatus.offer
  const interview = byStatus.interview + byStatus.offer
  const offer = byStatus.offer
  return {
    applied,
    screen,
    interview,
    offer,
    rejected: byStatus.rejected,
    withdrawn: byStatus.withdrawn,
  }
}
