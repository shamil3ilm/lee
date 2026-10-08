import type { EmployerWatchRow } from './watch-status'
import type { WatchMethod } from './watch-employers'

/**
 * Settings › Sources › Employer watch: search, filter and the one-line
 * summary. Pure and client-safe.
 */

export const WATCH_FILTERS = ['all', 'watching', 'check_due', 'not_watching'] as const
export type WatchFilter = (typeof WATCH_FILTERS)[number]

export const WATCH_FILTER_LABELS: Readonly<Record<WatchFilter, string>> = {
  all: 'All',
  watching: 'Watching',
  check_due: 'Check due',
  not_watching: 'Not watching',
}

export const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Oman',
}

/** The one plain "how lee checks" label: the first (strongest) method wins. */
const HOW_LABEL: Readonly<Record<WatchMethod, string>> = {
  adapter: 'Daily feed',
  alert: 'Email alerts',
  ai_search: 'Weekly AI search',
  manual: 'Check weekly',
}

export function howLeeChecks(methods: readonly WatchMethod[]): string {
  const first = methods[0]
  return first ? HOW_LABEL[first] : 'Check weekly'
}

export function otherMethods(methods: readonly WatchMethod[]): string[] {
  return methods.slice(1).map((m) => HOW_LABEL[m])
}

export interface WatchQuery {
  text: string
  filter: WatchFilter
  /** ISO-2 country, or '' for every country. */
  country: string
}

function matchesFilter(r: EmployerWatchRow, f: WatchFilter): boolean {
  if (f === 'watching') return r.watching
  if (f === 'not_watching') return !r.watching
  if (f === 'check_due') return r.status === 'check_due'
  return true
}

export function filterWatchRows(rows: readonly EmployerWatchRow[], q: WatchQuery): EmployerWatchRow[] {
  const text = q.text.trim().toLowerCase()
  return rows.filter((r) => {
    if (q.country && r.country !== q.country) return false
    if (!matchesFilter(r, q.filter)) return false
    if (!text) return true
    const country = (COUNTRY_NAMES[r.country] ?? r.country).toLowerCase()
    return r.name.toLowerCase().includes(text) || country.includes(text) || r.country.toLowerCase() === text
  })
}

/** "43 employers · 8 watched · 2 checks due · 1 failing". */
export function watchSummary(rows: readonly EmployerWatchRow[]): string {
  const watched = rows.filter((r) => r.watching).length
  const due = rows.filter((r) => r.status === 'check_due').length
  const failing = rows.filter((r) => r.status === 'error').length
  const parts = [`${rows.length} ${rows.length === 1 ? 'employer' : 'employers'}`, `${watched} watched`]
  if (due > 0) parts.push(`${due} ${due === 1 ? 'check' : 'checks'} due`)
  if (failing > 0) parts.push(`${failing} failing`)
  return parts.join(' · ')
}
