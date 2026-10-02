import * as profileQ from '@/lib/db/queries/profile'
import { buildSearchPrefs, type SearchPrefs } from '../search-prefs'
import type { AdapterContext } from './types'

/**
 * Search preferences for one poll: the source's config, else the user's
 * profile (role types, keywords, seniority, location preferences), else
 * lee's defaults. A missing profile or a failed read falls back quietly.
 */
export async function searchPrefsFor(config: unknown, ctx?: AdapterContext): Promise<SearchPrefs> {
  let profile: Awaited<ReturnType<typeof profileQ.get>> | null = null
  if (ctx?.userId) {
    try {
      profile = (await profileQ.get(ctx.userId)) ?? null
    } catch {
      profile = null
    }
  }
  return buildSearchPrefs(config, profile)
}

/** `geo:worldwide` when the posting takes applicants from anywhere. */
export function geoTag(worldwide: boolean): string {
  return worldwide ? 'geo:worldwide' : 'geo:restricted'
}

/** Seconds, milliseconds or an ISO string → Date (undefined when invalid). */
export function toDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const d =
    typeof value === 'number'
      ? new Date(value < 1e12 ? value * 1000 : value)
      : new Date(String(value))
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function employmentTypeOf(value: unknown): 'fulltime' | 'contract' | 'parttime' | 'internship' | 'unknown' {
  const s = (Array.isArray(value) ? value.join(' ') : String(value ?? '')).toLowerCase()
  if (/full/.test(s)) return 'fulltime'
  if (/contract|freelance|temporary/.test(s)) return 'contract'
  if (/part/.test(s)) return 'parttime'
  if (/intern/.test(s)) return 'internship'
  return 'unknown'
}
