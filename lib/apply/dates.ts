import { tzOffsetMinutes } from '@/lib/ui/timezone'

/**
 * Calendar days in the user's timezone. Pure. The shortlist snapshot is
 * keyed by the user's local day, "Mark applied" takes a local date, and the
 * funnel's "this week" starts on the user's Monday.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** yyyy-mm-dd of `at` in `tz`. */
export function localDay(at: Date, tz: string): string {
  const shifted = new Date(at.getTime() + tzOffsetMinutes(tz, at) * 60_000)
  return shifted.toISOString().slice(0, 10)
}

export function isDayString(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** The instant of `hour`:00 local time on `day` in `tz`. */
export function dayAtHour(day: string, tz: string, hour: number): Date {
  const naive = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`)
  // The offset at that local time (DST-safe enough for whole days).
  return new Date(naive.getTime() - tzOffsetMinutes(tz, naive) * 60_000)
}

/**
 * When an application was applied, from the local date the user picked:
 * today → now; another day → noon local (no time was given).
 */
export function appliedInstant(day: string, tz: string, now: Date): Date {
  return day === localDay(now, tz) ? now : dayAtHour(day, tz, 12)
}

/**
 * The follow-up nudge: `businessDays` weekdays after the local day you
 * applied, at 09:00 local (lib/followups/cadence.ts).
 */
export function followupDue(appliedAt: Date, businessDays: number, tz: string): Date {
  let t = new Date(`${localDay(appliedAt, tz)}T00:00:00Z`).getTime()
  for (let left = Math.max(0, Math.floor(businessDays)); left > 0; ) {
    t += DAY_MS
    const dow = new Date(t).getUTCDay()
    if (dow !== 0 && dow !== 6) left -= 1
  }
  return dayAtHour(new Date(t).toISOString().slice(0, 10), tz, 9)
}

/** Monday 00:00 local of the week containing `now`, as an instant. */
export function weekStart(now: Date, tz: string): Date {
  const today = localDay(now, tz)
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  const back = dow === 0 ? 6 : dow - 1
  const monday = new Date(new Date(`${today}T00:00:00Z`).getTime() - back * DAY_MS).toISOString().slice(0, 10)
  return dayAtHour(monday, tz, 0)
}

/** yyyy-mm-dd `days` before `day`. */
export function dayMinus(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - days * DAY_MS).toISOString().slice(0, 10)
}
