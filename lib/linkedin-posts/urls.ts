/**
 * LinkedIn post and profile links, canonicalised OFFLINE. Client-safe, no
 * imports. lee never requests a linkedin.com page: LinkedIn's User
 * Agreement (8.2) forbids automated access, and reading other members'
 * posts through the API is partner-only. These helpers only rewrite a link
 * found in the user's own email or pasted by the user:
 *
 *   - tracking wrappers are unwrapped (`/comm/…`, `/redir/redirect?url=…`,
 *     a URL carried in a query parameter);
 *   - a post becomes `https://www.linkedin.com/feed/update/urn:li:<kind>:<id>/`
 *     when its id is readable (feed URNs and `/posts/<slug>-activity-<id>-…`),
 *     else `https://www.linkedin.com/posts/<slug>/`;
 *   - every query parameter (trk, midToken, lipi, otpToken …) and fragment
 *     is dropped: some sign the recipient in and must never be stored.
 */

export type PostUrnKind = 'activity' | 'share' | 'ugcPost'

export interface PostLink {
  /** Dedupe key: `activity:7300…`, or `slug:<slug>` when no id is readable. */
  key: string
  url: string
}

const TARGET_PARAMS = new Set(['url', 'u', 'target', 'dest', 'destination', 'redirect', 'redirect_url', 'rurl', 'goto', 'link', 'to'])
const MAX_DEPTH = 3
const ID = String.raw`(\d{10,25})`
const URN_RE = new RegExp(String.raw`urn:li:(activity|share|ugcPost):${ID}`, 'i')
const SLUG_ID_RE = new RegExp(String.raw`-(activity|share|ugcPost)-${ID}(?:-|$)`, 'i')
const SLUG_RE = /^[\p{L}\p{N}%_.-]{3,200}$/u
const PROFILE_SLUG_RE = /^[\p{L}\p{N}%_-]{3,100}$/u

function parse(value: string): URL | null {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

/** True for linkedin.com and its subdomains (www., ae., m. …). */
export function isLinkedInHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return h === 'linkedin.com' || h.endsWith('.linkedin.com')
}

/** The link plus every http(s) URL carried in its query (tracking redirects). */
function candidates(link: URL, depth = 0): URL[] {
  const out = [link]
  if (depth >= MAX_DEPTH) return out
  for (const [key, value] of link.searchParams) {
    if (!TARGET_PARAMS.has(key.toLowerCase()) && !/^https?(:|%3a)/i.test(value)) continue
    const inner = parse(value) ?? parse(safeDecode(value))
    if (inner) out.push(...candidates(inner, depth + 1))
  }
  return out
}

/** Path without the email-tracking prefix ("/comm/feed/update/…" → "/feed/update/…"). */
function cleanPath(u: URL): string {
  return safeDecode(u.pathname).replace(/^\/comm(?=\/)/i, '')
}

function normKind(k: string): PostUrnKind {
  const l = k.toLowerCase()
  return l === 'share' ? 'share' : l === 'ugcpost' ? 'ugcPost' : 'activity'
}

function fromUrl(u: URL): PostLink | null {
  if (!isLinkedInHost(u.hostname)) return null
  const path = cleanPath(u)
  const urn = /^\/(?:feed\/update|embed\/feed\/update)\//i.test(path) ? URN_RE.exec(path) : null
  if (urn) {
    const kind = normKind(urn[1]!)
    return { key: `${kind}:${urn[2]}`, url: `https://www.linkedin.com/feed/update/urn:li:${kind}:${urn[2]}/` }
  }
  const posts = /^\/posts\/([^/]+)\/?$/i.exec(path)
  if (!posts) return null
  const slug = posts[1]!
  const withId = SLUG_ID_RE.exec(slug)
  if (withId) {
    const kind = normKind(withId[1]!)
    return { key: `${kind}:${withId[2]}`, url: `https://www.linkedin.com/feed/update/urn:li:${kind}:${withId[2]}/` }
  }
  if (!SLUG_RE.test(slug)) return null
  return { key: `slug:${slug.toLowerCase()}`, url: `https://www.linkedin.com/posts/${encodeURIComponent(slug)}/` }
}

/** A LinkedIn post link → its canonical form; null when it is not a post link. Never fetched. */
export function canonicalPostUrl(href: string): PostLink | null {
  const link = parse(href)
  if (!link) return null
  for (const c of candidates(link)) {
    const hit = fromUrl(c)
    if (hit) return hit
  }
  return null
}

/** A member profile link (`/in/<slug>`, also `/comm/in/<slug>`) → `https://www.linkedin.com/in/<slug>/`. */
export function canonicalProfileUrl(href: string): string | null {
  const link = parse(href)
  if (!link) return null
  for (const c of candidates(link)) {
    if (!isLinkedInHost(c.hostname)) continue
    const m = /^\/in\/([^/]+)\/?$/i.exec(cleanPath(c))
    if (m && PROFILE_SLUG_RE.test(m[1]!)) return `https://www.linkedin.com/in/${encodeURIComponent(m[1]!.toLowerCase())}/`
  }
  return null
}

/** True when the link is a linkedin.com page (posts, profiles, the feed, settings …). */
export function isLinkedInUrl(href: string): boolean {
  const u = parse(href)
  return u !== null && isLinkedInHost(u.hostname)
}

/**
 * LinkedIn's outbound-link wrapper (`/redir/redirect?url=…`, `/safety/go?url=…`)
 * → the target, read from the link itself (not followed). Other links unchanged.
 */
export function unwrapLinkedInRedirect(href: string): string {
  const u = parse(href)
  if (!u || !isLinkedInHost(u.hostname) || !/^\/(?:comm\/)?(?:redir\/redirect|safety\/go)\/?$/i.test(u.pathname)) return href
  const target = parse(u.searchParams.get('url') ?? '')
  return target && !isLinkedInHost(target.hostname) ? target.toString() : href
}
