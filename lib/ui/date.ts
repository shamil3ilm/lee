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

export function shortDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(DISPLAY_LOCALE, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function isWithinDays(date: Date | string, days: number): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = d.getTime() - Date.now()
  return diff >= 0 && diff <= days * DAY_MS
}
