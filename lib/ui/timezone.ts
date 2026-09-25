/**
 * Per-user timezone helpers.
 *
 * The DB now stores an IANA timezone id on `user_profile.timezone`
 * (default 'Asia/Dubai'). These helpers keep formatting/logic tz-aware so
 * calendar events, digest scheduling, and date rendering all agree with the
 * user's local time regardless of the server region.
 *
 * All helpers here are pure and safe to import from server or client code.
 */

/** IANA fallback used when the profile hasn't been created yet. */
export const DEFAULT_TIMEZONE = 'Asia/Dubai'

/**
 * Return the current UTC offset (minutes east of UTC) for the given IANA tz
 * at the given instant. Uses Intl to avoid a tz database dep. Returns 0 if
 * the tz id is invalid.
 */
function tzOffsetMinutes(tz: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = dtf.formatToParts(at)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
    const y = get('year')
    const m = get('month')
    const d = get('day')
    let h = get('hour')
    const mm = get('minute')
    const s = get('second')
    // Intl returns hour "24" at midnight in some tz — normalize.
    if (h === 24) h = 0
    const asUtc = Date.UTC(y, m - 1, d, h, mm, s)
    return Math.round((asUtc - at.getTime()) / 60000)
  } catch {
    return 0
  }
}

/**
 * Human-friendly date/time string rendered in the given IANA tz.
 * Server-safe (no `Intl.DateTimeFormat().resolvedOptions().timeZone` calls).
 */
export function formatInTz(
  date: Date | string,
  tz: string,
  opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz }).format(d)
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(d)
  }
}

/**
 * True if `now` (an instant) falls on a Monday when interpreted in `tz`.
 * The digest cron runs daily in UTC; we narrow the send to Monday-local for
 * each user so the email arrives on their Monday morning, not the server's.
 */
export function isMondayInTz(tz: string, now: Date = new Date()): boolean {
  const offsetMin = tzOffsetMinutes(tz, now)
  const local = new Date(now.getTime() + offsetMin * 60_000)
  // getUTCDay on the shifted instant gives the local day-of-week.
  return local.getUTCDay() === 1
}

/**
 * True if `sentAt` is within the same tz-local week as `now`. The week is
 * defined as Monday 00:00 through Sunday 23:59:59.999 local. Prevents a
 * double-send if the cron misfires twice on the same local Monday.
 */
export function sentThisTzWeek(
  sentAt: Date | null | undefined,
  tz: string,
  now: Date = new Date(),
): boolean {
  if (!sentAt) return false
  const offsetMin = tzOffsetMinutes(tz, now)
  const local = new Date(now.getTime() + offsetMin * 60_000)
  const dow = local.getUTCDay() // 0=Sun..6=Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  const mondayLocal = new Date(local)
  mondayLocal.setUTCDate(local.getUTCDate() - daysSinceMonday)
  mondayLocal.setUTCHours(0, 0, 0, 0)
  // Convert Monday-local back to a UTC instant by undoing the offset.
  const mondayUtc = new Date(mondayLocal.getTime() - offsetMin * 60_000)
  return sentAt.getTime() >= mondayUtc.getTime()
}

/**
 * Best-effort list of common IANA timezone ids. Uses Intl.supportedValuesOf
 * when the runtime supports it (Node 22 does); otherwise falls back to a
 * short curated list so profile-form still works.
 */
export function listTimezones(): string[] {
  try {
    const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    if (typeof anyIntl.supportedValuesOf === 'function') {
      return anyIntl.supportedValuesOf('timeZone')
    }
  } catch {
    // fall through
  }
  return [
    'UTC',
    'Asia/Dubai',
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
  ]
}

/**
 * Client-only: the browser's current tz per Intl. Used by the profile form's
 * "auto-detect" button to pre-fill a sensible default.
 */
export function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz.length > 0 ? tz : DEFAULT_TIMEZONE
  } catch {
    return DEFAULT_TIMEZONE
  }
}
