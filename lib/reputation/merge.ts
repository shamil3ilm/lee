import type { AutoSource, ReputationSignal } from './types'

/**
 * Merge a refresh into the stored signals, per source:
 * - a source that answered: its fresh items first, then its older stored
 *   items (GDELT only looks back 3 months, so weekly refreshes accumulate);
 * - a source that failed: its stored items are kept unchanged;
 * then drop items older than two years and cap each source, newest first.
 * The per-source caps bound the row to a few KB (0.5 GB database).
 */

export const SIGNAL_CAPS: Readonly<Record<AutoSource, number>> = { hn: 15, gdelt: 25, wikidata: 0 }
export const MAX_SIGNAL_AGE_DAYS = 730
const DAY_MS = 24 * 60 * 60 * 1000

function newestFirst(a: ReputationSignal, b: ReputationSignal): number {
  if (a.date === b.date) return 0
  if (a.date === null) return 1
  if (b.date === null) return -1
  return a.date < b.date ? 1 : -1
}

function uniqueById(items: readonly ReputationSignal[]): ReputationSignal[] {
  const seen = new Set<string>()
  return items.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

export function mergeSignals(
  existing: readonly ReputationSignal[],
  fresh: Readonly<Partial<Record<AutoSource, readonly ReputationSignal[]>>>,
  now: Date,
): ReputationSignal[] {
  const cutoff = new Date(now.getTime() - MAX_SIGNAL_AGE_DAYS * DAY_MS).toISOString().slice(0, 10)
  const sources = Object.keys(SIGNAL_CAPS) as AutoSource[]
  return sources.flatMap((source) => {
    const stored = existing.filter((s) => s.source === source)
    const answered = fresh[source]
    const combined = answered ? uniqueById([...answered, ...stored]) : stored
    return combined
      .filter((s) => s.date === null || s.date >= cutoff)
      .sort(newestFirst)
      .slice(0, SIGNAL_CAPS[source])
  })
}
