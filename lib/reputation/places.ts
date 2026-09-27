import * as companiesQ from '@/lib/db/queries/companies'
import * as repQ from '@/lib/db/queries/companyReputation'
import * as settingsQ from '@/lib/db/queries/reputationSettings'
import { resolveServiceSecret } from '@/lib/settings/secrets'
import { errorText, requestJson, type HttpDeps } from './http'

/**
 * Optional Google Places (New) rating check — off by default, user's own
 * key, on demand only (docs/company-reviews.md):
 *   1. Text Search with field mask `places.id` (Essentials IDs Only, free);
 *   2. Place Details: rating, userRatingCount, reviews, googleMapsUri
 *      (Enterprise + Atmosphere: 1,000 free calls a month).
 * Every HTTP call first reserves one unit of the monthly budget, capped at
 * PLACES_HARD_MONTHLY_CAP whatever the user sets; with no budget left
 * nothing is sent. Only the place id is stored (Places caching terms);
 * ratings and reviews are returned for display and never persisted.
 */

export const PLACES_HARD_MONTHLY_CAP = 900
export const PLACES_API = 'https://places.googleapis.com/v1'
const DETAILS_FIELDS = 'displayName,rating,userRatingCount,reviews,googleMapsUri'

export interface PlaceReview {
  rating: number | null
  text: string
  relativeTime: string | null
  author: string | null
  authorUri: string | null
  reviewUri: string | null
}

export interface PlaceRating {
  name: string | null
  rating: number | null
  count: number | null
  mapsUri: string | null
  reviews: PlaceReview[]
}

export type PlacesOutcome =
  | { ok: true; place: PlaceRating; callsUsed: number }
  | { ok: false; reason: 'disabled' | 'no_key' | 'cap_reached' | 'not_found' | 'error'; message: string }

export function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7)
}

interface RawReview {
  rating?: number
  text?: { text?: string }
  originalText?: { text?: string }
  relativePublishTimeDescription?: string
  authorAttribution?: { displayName?: string; uri?: string }
  googleMapsUri?: string
}

export function toPlaceRating(body: unknown): PlaceRating {
  const b = (body ?? {}) as {
    displayName?: { text?: string }
    rating?: number
    userRatingCount?: number
    googleMapsUri?: string
    reviews?: RawReview[]
  }
  return {
    name: b.displayName?.text ?? null,
    rating: typeof b.rating === 'number' ? b.rating : null,
    count: typeof b.userRatingCount === 'number' ? b.userRatingCount : null,
    mapsUri: b.googleMapsUri ?? null,
    reviews: (Array.isArray(b.reviews) ? b.reviews : []).slice(0, 5).map((r) => ({
      rating: typeof r.rating === 'number' ? r.rating : null,
      text: (r.text?.text ?? r.originalText?.text ?? '').slice(0, 1000),
      relativeTime: r.relativePublishTimeDescription ?? null,
      author: r.authorAttribution?.displayName ?? null,
      authorUri: r.authorAttribution?.uri ?? null,
      reviewUri: r.googleMapsUri ?? null,
    })),
  }
}

export interface PlacesDeps extends HttpDeps {
  now?: Date
}

class BudgetSpent extends Error {}

export async function checkGoogleRating(
  userId: string,
  companyId: string,
  deps: PlacesDeps = {},
): Promise<PlacesOutcome> {
  const settings = await settingsQ.get(userId)
  if (!settings.placesEnabled) {
    return { ok: false, reason: 'disabled', message: 'Google Places is off. Turn it on in Settings › Integrations.' }
  }
  const { key } = await resolveServiceSecret(userId, 'google_places')
  if (!key) return { ok: false, reason: 'no_key', message: 'Add your Google Places API key in Settings › AI.' }
  const company = await companiesQ.getById(userId, companyId)
  if (!company) return { ok: false, reason: 'not_found', message: 'Company not found.' }
  const month = monthKey(deps.now ?? new Date())
  const reserve = async (): Promise<number> => {
    const n = await settingsQ.reservePlacesCall(userId, month, PLACES_HARD_MONTHLY_CAP)
    if (n === null) throw new BudgetSpent()
    return n
  }
  const headers = { 'x-goog-api-key': key, 'content-type': 'application/json' }
  const findPlaceId = async (): Promise<string | null> => {
    await reserve()
    const textQuery = [company.name, company.headquartersCity, company.headquartersCountry].filter(Boolean).join(' ')
    const found = (await requestJson('places', `${PLACES_API}/places:searchText`, deps, {
      method: 'POST',
      headers: { ...headers, 'x-goog-fieldmask': 'places.id' },
      body: JSON.stringify({ textQuery, pageSize: 1 }),
    })) as { places?: Array<{ id?: string }> } | null
    const id = found?.places?.[0]?.id ?? null
    if (id) await repQ.savePlaceId(userId, companyId, id)
    return id
  }
  try {
    const stored = (await repQ.get(userId, companyId))?.placesPlaceId ?? null
    const placeId = stored ?? (await findPlaceId())
    if (!placeId) return { ok: false, reason: 'not_found', message: 'Google has no place for this company.' }
    const used = await reserve()
    const details = await requestJson('places', `${PLACES_API}/places/${encodeURIComponent(placeId)}`, deps, {
      headers: { ...headers, 'x-goog-fieldmask': DETAILS_FIELDS },
    })
    return { ok: true, place: toPlaceRating(details), callsUsed: used }
  } catch (e) {
    if (e instanceof BudgetSpent) {
      return { ok: false, reason: 'cap_reached', message: "This month's Google Places budget is used up." }
    }
    return { ok: false, reason: 'error', message: `Google Places failed: ${errorText(e)}` }
  }
}
