/**
 * Counts from one source poll: stored on `sources.last_result`, in the
 * discovery-source job's run summary and in the `source_polled` event.
 * A mutable tally threaded through ingestion (like ScoringBudget).
 */
export interface SourcePollStats {
  /** Unique items the adapter returned. */
  fetched: number
  /** Rows inserted (never seen before). */
  new: number
  /** AI scoring calls that succeeded (new rows and earlier unscored ones). */
  scored: number
  /** New job rows Scam Shield put in quarantine. */
  quarantined: number
  /** Items the source had already delivered (deduped). */
  skipped: number
  /** Emails an email-reading source could not parse (set only when > 0). */
  parseFailures?: number
}

export function emptyPollStats(): SourcePollStats {
  return { fetched: 0, new: 0, scored: 0, quarantined: 0, skipped: 0 }
}

/** `sources.last_result` as stored: the stats plus when the poll finished. */
export interface SourceLastResult extends SourcePollStats {
  at: string
}

export function readSourceLastResult(raw: unknown): SourceLastResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const num = (k: string): number => {
    const v = r[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return {
    fetched: num('fetched'),
    new: num('new'),
    scored: num('scored'),
    quarantined: num('quarantined'),
    skipped: num('skipped'),
    ...(num('parseFailures') > 0 ? { parseFailures: num('parseFailures') } : {}),
    at: typeof r.at === 'string' ? r.at : '',
  }
}

/** "12 found · 3 new · 1 quarantined · 2 unreadable" */
export function describePollStats(s: SourcePollStats): string {
  const parts = [`${s.fetched} found`, `${s.new} new`]
  if (s.quarantined > 0) parts.push(`${s.quarantined} quarantined`)
  if (s.parseFailures) parts.push(`${s.parseFailures} unreadable`)
  return parts.join(' · ')
}

export interface LastCheck {
  at: Date
  /** New discoveries across the sources polled in that run (within a day of it). */
  newCount: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Discovery header: when sources were last checked and how many new items came in. */
export function lastCheck(
  sources: ReadonlyArray<{ lastPolledAt: Date | null; lastResult: unknown }>,
): LastCheck | null {
  const polled = sources.filter((s): s is { lastPolledAt: Date; lastResult: unknown } => s.lastPolledAt !== null)
  if (polled.length === 0) return null
  const at = new Date(Math.max(...polled.map((s) => s.lastPolledAt.getTime())))
  const newCount = polled
    .filter((s) => at.getTime() - s.lastPolledAt.getTime() < DAY_MS)
    .reduce((sum, s) => sum + (readSourceLastResult(s.lastResult)?.new ?? 0), 0)
  return { at, newCount }
}
