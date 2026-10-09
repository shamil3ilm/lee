/**
 * "Look up on Google Maps": a plain Maps URL (developers.google.com/maps/
 * documentation/urls: "You don't need a Google API key to use Maps URLs")
 * that the user opens in their own browser. lee never calls a Maps or
 * Places API for discovery and stores nothing from Google Maps: the Maps
 * Platform terms forbid scraping and caching Maps content ("Customer will
 * not export, extract, or otherwise scrape Google Maps Content … (iii) copy
 * and save business names, addresses, or user reviews"). Client-safe, pure.
 */

export const GOOGLE_MAPS_SEARCH = 'https://www.google.com/maps/search/'

export function googleMapsSearchUrl(name: string, place?: string | null): string {
  const query = [name, place].map((s) => (s ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ').slice(0, 300)
  return `${GOOGLE_MAPS_SEARCH}?api=1&query=${encodeURIComponent(query)}`
}
