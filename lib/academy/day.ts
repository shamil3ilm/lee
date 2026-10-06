import { isValidTimeZone } from '@/lib/ui/date'

/**
 * Calendar days (YYYY-MM-DD) in the user's time zone: the daily plan, the
 * streak and "due today" all follow the user's day, not the server's. Pure.
 */

const DAY_MS = 86_400_000

export function localDay(now: Date, timeZone: string | null | undefined): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC'
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function toUtc(day: string): number {
  return Date.parse(`${day}T00:00:00Z`)
}

export function addDays(day: string, n: number): string {
  return new Date(toUtc(day) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtc(value))
}
