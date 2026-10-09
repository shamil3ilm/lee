import { resolveLocation } from '@/lib/regions/normalize'
import { anyWithin, countryOf, getNode } from '@/lib/regions/tree'

/**
 * GCC location normaliser: one canonical { country, city } for the many
 * ways boards write a Gulf place — "AE - Dubai, United Arab Emirates"
 * (Workday), "Riyadh, SA" (SuccessFactors), "Riyadh, Riyadh Province,
 * Saudi Arabia" (Workable), "ARE" (ISO-3), "دبي", double-encoded Arabic.
 * A thin view over the region normaliser (lib/regions/normalize.ts): the
 * first GCC place named sets the country; its city when it names one.
 */

export type GccCode = 'AE' | 'SA' | 'QA' | 'KW' | 'BH' | 'OM'

export interface GccLocation {
  countryCode: GccCode
  country: string
  /** Canonical city ("Dubai", "Al Khobar", "Kuwait City"); null when only the country is named. */
  city: string | null
}

export const GCC_COUNTRY_NAMES: Readonly<Record<GccCode, string>> = {
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Oman',
}

export function parseGccLocation(raw: string | null | undefined): GccLocation | null {
  const { places } = resolveLocation(raw, { trustCodes: true })
  for (const place of places) {
    const country = countryOf(place.id)
    if (!country || !anyWithin([country], 'gcc')) continue
    const code = country.toUpperCase() as GccCode
    const city = getNode(place.id)?.kind === 'city' ? getNode(place.id)!.name : null
    return { countryCode: code, country: GCC_COUNTRY_NAMES[code], city }
  }
  return null
}
