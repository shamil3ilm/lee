import { cache } from 'react'
import * as profileQ from '@/lib/db/queries/profile'
import type { NewUserProfile, UserProfile } from '@/lib/db/queries/profile'

/**
 * Default location preferences applied on first profile save (spec §5.5).
 * GCC + India (Kerala + tier-1 cities). Users can override any of these later.
 */
export const DEFAULT_LOCATION_PREFS = [
  { country: 'AE', cities: [], priority: 1 },
  { country: 'SA', cities: [], priority: 1 },
  { country: 'QA', cities: [], priority: 1 },
  { country: 'KW', cities: [], priority: 1 },
  { country: 'BH', cities: [], priority: 2 },
  { country: 'OM', cities: [], priority: 2 },
  { country: 'IN', region: 'Kerala', cities: [], priority: 1 },
  {
    country: 'IN',
    cities: ['Bengaluru', 'Hyderabad', 'Chennai', 'Mumbai', 'Pune', 'NCR'],
    priority: 2,
  },
] as const

/**
 * Default benefit weighting applied on first profile save (spec §5.6).
 * Visa sponsorship and compensation floor are top priorities.
 */
export const DEFAULT_BENEFIT_PREFS = {
  must_haves: [],
  weights: {
    visa_sponsorship: 10,
    family_health_insurance: 9,
    compensation_meets_floor: 10,
    remote_or_hybrid: 8,
    relocation_package: 7,
    equity: 4,
    four_day_week: 3,
  },
} as const

/**
 * Read the profile, memoized per request with React `cache()` so a layout,
 * page and widgets that all need it share one query. Writes go through
 * `saveProfile` (which reads `profileQ.get` directly, never the memo).
 * Outside a React server render (route handlers, cron, tests) `cache` is a
 * pass-through.
 */
export const getProfile = cache(
  (userId: string): Promise<UserProfile | null> => profileQ.get(userId),
)

/**
 * Upsert a user profile. On the FIRST save (no row exists yet) we merge in
 * the default location/benefit seeds so a brand-new profile lands with
 * sensible defaults. Fields explicitly passed in `patch` always win over
 * defaults so callers can override them from the start.
 */
export async function saveProfile(
  userId: string,
  patch: Partial<NewUserProfile>,
): Promise<UserProfile> {
  const existing = await profileQ.get(userId)
  if (existing) {
    return profileQ.upsert(userId, patch)
  }

  const merged: Partial<NewUserProfile> = {
    locationPrefs: DEFAULT_LOCATION_PREFS as unknown as NewUserProfile['locationPrefs'],
    benefitPrefs: DEFAULT_BENEFIT_PREFS as unknown as NewUserProfile['benefitPrefs'],
    ...patch,
  }
  return profileQ.upsert(userId, merged)
}
