import type { NewUserProfile, UserProfile } from '@/lib/db/queries/profile'
import { DEFAULT_LOCATION_PREFS } from '@/lib/profile/service'

/**
 * SERVER-ONLY. Search preferences back to the defaults a new profile gets
 * (the fields Settings › Search saves, lib/discovery/relevance/form.ts).
 * `searchPrefsSavedAt: null` turns filtering off until the user saves again.
 */
export const SEARCH_PREF_DEFAULTS: Partial<NewUserProfile> = {
  roleTypes: [],
  seniorityLevels: [],
  seniority: null,
  remotePref: 'any',
  targetRegions: null,
  locationPrefs: DEFAULT_LOCATION_PREFS as unknown as NewUserProfile['locationPrefs'],
  remoteScope: 'worldwide',
  acceptRelocation: false,
  willingToRelocateTo: [],
  keywords: [],
  dealbreakers: [],
  discoveryPrefs: {},
  searchPrefsSavedAt: null,
}

const json = (v: unknown): string => JSON.stringify(v ?? null)

/** The search-preference fields that differ from the defaults (names only). */
export function changedSearchPrefs(row: UserProfile | null): string[] {
  if (!row) return []
  return Object.entries(SEARCH_PREF_DEFAULTS)
    .filter(([k, v]) => json((row as Record<string, unknown>)[k]) !== json(v))
    .map(([k]) => k)
}

/** The current values, for the backup. */
export function searchPrefsOf(row: UserProfile | null): Record<string, unknown> {
  if (!row) return {}
  return Object.fromEntries(Object.keys(SEARCH_PREF_DEFAULTS).map((k) => [k, (row as Record<string, unknown>)[k]]))
}
