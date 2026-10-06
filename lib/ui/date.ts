const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Fixed locale for rendered dates. Client components are server-rendered
 * first; formatting with the runtime default locale produced "Sep 27" on the
 * server and "27 Sept" in an en-IN/en-GB browser, which failed hydration and
 * forced React to re-render the whole tree (v17 §9.1 visual QA).
 */
export const DISPLAY_LOCALE = 'en-US'

export function relativeFromNow(date: Date | string): string {
  const target = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  const abs = Math.abs(diffMs)
  const sign = diffMs >= 0 ? 1 : -1

  const minutes = Math.round(abs / (60 * 1000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) {
    return sign > 0 ? `in ${minutes}m` : `${minutes}m ago`
  }
  const hours = Math.round(abs / (60 * 60 * 1000))
  if (hours < 24) {
    return sign > 0 ? `in ${hours}h` : `${hours}h ago`
  }
  const days = Math.round(abs / DAY_MS)
  if (days < 30) {
    return sign > 0 ? `in ${days}d` : `${days}d ago`
  }
  const months = Math.round(days / 30)
  return sign > 0 ? `in ${months}mo` : `${months}mo ago`
}

export function shortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(DISPLAY_LOCALE, { month: 'short', day: 'numeric' })
}

/**
 * A calendar day stored as `YYYY-MM-DD` (expense dates, CSV rows) in the app's
 * "Sep 21" style. Formatted in UTC so the day never shifts with the viewer's
 * timezone. Anything that isn't a valid day is returned unchanged.
 */
export function shortDay(isoDay: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return isoDay
  const d = new Date(`${isoDay}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return isoDay
  return d.toLocaleDateString(DISPLAY_LOCALE, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Ways an instant can be shown; every one is US style ("Sep 27, 2:30 PM"). */
export type DateTimeFormat = 'datetime' | 'datetime-year' | 'date' | 'date-year' | 'time'

const FORMAT_OPTIONS: Readonly<Record<DateTimeFormat, Intl.DateTimeFormatOptions>> = {
  datetime: { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  'datetime-year': { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' },
  date: { month: 'short', day: 'numeric' },
  'date-year': { month: 'short', day: 'numeric', year: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
}

/** True when `tz` is an IANA zone this runtime knows. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat(DISPLAY_LOCALE, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * An instant in US style, in the user's timezone when one is given (the
 * profile's IANA zone). Without one it falls back to the runtime zone, which
 * is UTC on the server: pass the user's zone wherever a time is shown.
 */
export function formatDateTime(
  date: Date | string,
  format: DateTimeFormat = 'datetime',
  timeZone?: string | null,
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  const opts = FORMAT_OPTIONS[format]
  return d.toLocaleString(DISPLAY_LOCALE, isValidTimeZone(timeZone) ? { ...opts, timeZone } : opts)
}

/** "Sep 27, 2:30 PM" in `timeZone` (see formatDateTime). */
export function shortDateTime(date: Date | string, timeZone?: string | null): string {
  return formatDateTime(date, 'datetime', timeZone)
}

export function isWithinDays(date: Date | string, days: number): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = d.getTime() - Date.now()
  return diff >= 0 && diff <= days * DAY_MS
}
