/**
 * "With N sources on, each is checked about every K days" (pure,
 * client-safe). The daily plan (lib/queue/capacity.ts) gives each user a
 * share of the Hobby cron budget for source polls and spends it on the
 * stalest sources first, so every source comes round once the share has
 * paid for all the others: K ≈ total poll cost / daily poll budget.
 */

export interface CheckInterval {
  /** Pollable sources that would be on. */
  sources: number
  /** About how often each is checked (days, at least 1); 0 with no sources. */
  everyDays: number
}

export function checkInterval(costsMs: readonly number[], dailyBudgetMs: number): CheckInterval {
  if (costsMs.length === 0) return { sources: 0, everyDays: 0 }
  const total = costsMs.reduce((s, c) => s + Math.max(0, c), 0)
  const everyDays = Math.max(1, Math.ceil(total / Math.max(1, dailyBudgetMs)))
  return { sources: costsMs.length, everyDays }
}

/** Show the note once a selection would turn on this many sources (or slows the cycle past a day). */
export const CAPACITY_NOTE_MIN_TURN_ON = 10

export function capacityNote(interval: CheckInterval): string | null {
  if (interval.sources === 0) return null
  const every = interval.everyDays <= 1 ? 'every day' : `every ${interval.everyDays} days`
  const n = `${interval.sources} ${interval.sources === 1 ? 'source' : 'sources'}`
  return `lee checks the stalest sources first each day; with ${n} on, each is checked about ${every}.`
}
