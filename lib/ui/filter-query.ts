/**
 * Pure helpers behind the auto-apply filters (components/filters). URL query
 * strings are the filter state: these build them from a form's entries or
 * from a patch, so a filter change is a `router.replace` to the new URL.
 */

/** Params that never survive a filter change: any change starts at page 1. */
const RESET_ON_FILTER = new Set(['page'])

export interface FilterQueryOptions {
  /** Values equal to their default are left out, so URLs stay short ("range=7d"). */
  defaults?: Readonly<Record<string, string>>
}

/**
 * Form entries → query string (no leading "?"). Empty values, files, values
 * equal to their default and `page` are dropped; order is kept.
 */
export function filterQuery(
  entries: Iterable<readonly [string, FormDataEntryValue]>,
  { defaults = {} }: FilterQueryOptions = {},
): string {
  const out = new URLSearchParams()
  for (const [key, value] of entries) {
    if (typeof value !== 'string') continue
    const v = value.trim()
    if (v === '' || RESET_ON_FILTER.has(key)) continue
    if (defaults[key] === v) continue
    out.append(key, v)
  }
  return out.toString()
}

/**
 * Current query + a patch → query string. `null`, `undefined` or "" deletes
 * a key; `page` is always reset.
 */
export function mergeQuery(
  current: string | URLSearchParams,
  patch: Readonly<Record<string, string | null | undefined>>,
): string {
  const next = new URLSearchParams(current)
  for (const key of RESET_ON_FILTER) next.delete(key)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') next.delete(key)
    else next.set(key, value)
  }
  return next.toString()
}

/** "/radar" + "source=hn" → "/radar?source=hn"; an empty query gives the bare path. */
export function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path
}
