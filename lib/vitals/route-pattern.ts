/**
 * Collapse a concrete pathname into its route pattern so vitals aggregate
 * per page type, not per record: `/applications/5f0c…` → `/applications/[id]`.
 * The app's dynamic segments are all ids (uuids, or numeric ids from older
 * URLs), so any id-looking segment becomes `[id]`; everything else is kept.
 *
 * Runs in the browser (reporter) and again on the server (/api/vitals), so
 * a hand-crafted beacon can't bypass it.
 */

export const MAX_ROUTE_LENGTH = 80
const MAX_SEGMENTS = 6

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC = /^\d+$/
// Long hex / base64url tokens (hashes, share ids).
const TOKEN = /^[A-Za-z0-9_-]{20,}$/
const SAFE_SEGMENT = /^[a-z0-9-]+$/

function normalizeSegment(segment: string): string {
  if (UUID.test(segment) || NUMERIC.test(segment) || TOKEN.test(segment)) return '[id]'
  const lower = segment.toLowerCase()
  // Anything unusual (encoded chars, dots, uppercase slugs) collapses too, so
  // the stored route set stays small and never holds user-entered text.
  return SAFE_SEGMENT.test(lower) ? lower : '[id]'
}

export function toRoutePattern(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? ''
  const segments = path
    .split('/')
    .filter(Boolean)
    .slice(0, MAX_SEGMENTS)
    .map(normalizeSegment)
  // Drop whole trailing segments (never cut one in half) to fit the cap.
  let route = `/${segments.join('/')}`
  while (route.length > MAX_ROUTE_LENGTH) route = route.slice(0, route.lastIndexOf('/')) || '/'
  return route
}

/** The shape toRoutePattern produces; the API rejects anything else. */
export const ROUTE_PATTERN_RE = /^\/(?:(?:[a-z0-9-]+|\[id\])(?:\/(?:[a-z0-9-]+|\[id\]))*)?$/
