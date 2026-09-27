/**
 * When queued work next runs, for Settings › Background jobs. Mirrors the
 * crons in vercel.json (a unit test keeps them in sync): the daily scheduler
 * enqueues at SCHEDULE_HOUR_UTC and the drains run at DRAIN_HOURS_UTC. A
 * visit or "Run now" may run jobs sooner; this is the latest they run.
 */
export const SCHEDULE_HOUR_UTC = 9
export const DRAIN_HOURS_UTC: readonly number[] = [12, 16, 21]

const HOUR_MS = 60 * 60 * 1000

function atUtcHour(day: Date, hour: number): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour))
}

/** First cron drain strictly after `t`. */
export function nextDrainAfter(t: Date): Date {
  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    const day = new Date(t.getTime() + dayOffset * 24 * HOUR_MS)
    for (const h of DRAIN_HOURS_UTC) {
      const at = atUtcHour(day, h)
      if (at.getTime() > t.getTime()) return at
    }
  }
  return atUtcHour(new Date(t.getTime() + 24 * HOUR_MS), DRAIN_HOURS_UTC[0] ?? 12)
}

/** Next daily scheduler run strictly after `now`. */
export function nextScheduleAfter(now: Date): Date {
  const today = atUtcHour(now, SCHEDULE_HOUR_UTC)
  return today.getTime() > now.getTime() ? today : new Date(today.getTime() + 24 * HOUR_MS)
}

/**
 * Next time a job type runs: a pending job waits for the first drain after
 * it is due; otherwise the type's next run is the first drain after the
 * next daily schedule.
 */
export function nextRunAt(now: Date, pendingRunAfter: Date | null): Date {
  if (pendingRunAfter) {
    const due = pendingRunAfter.getTime() > now.getTime() ? pendingRunAfter : now
    return nextDrainAfter(due)
  }
  return nextDrainAfter(nextScheduleAfter(now))
}
