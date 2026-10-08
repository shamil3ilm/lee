/**
 * Google Alerts links. Every result in an alert email or feed is wrapped
 * as `https://www.google.com/url?...&url=<target>&...`. lee unwraps it
 * OFFLINE (never fetching Google) and drops links that stay on google.com
 * (settings, "see more results", flags), so only the target page is kept,
 * without Google's tracking parameters.
 */

function isGoogleHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  return h === 'google.com' || /^google\.[a-z.]{2,6}$/.test(h) || h.endsWith('.google.com')
}

const TRACKING = /^(?:utm_[a-z]+|gclid|fbclid|ved|usg|sa|ct|cd|rct|ust)$/i

/** The posting URL a Google Alerts link points at, or null for Google-only links. */
export function unwrapGoogleUrl(href: string | null | undefined): string | null {
  if (!href) return null
  let url: URL
  try {
    url = new URL(href.replace(/&amp;/g, '&'))
  } catch {
    return null
  }
  if (isGoogleHost(url.hostname) && url.pathname === '/url') {
    const target = url.searchParams.get('url') ?? url.searchParams.get('q')
    if (!target) return null
    return unwrapGoogleUrl(target)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (isGoogleHost(url.hostname)) return null
  for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k)
  url.hash = ''
  return url.toString()
}

/** "careers.example.com" → "example.com" for a readable company hint. */
export function siteName(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^(?:www|careers|jobs|apply|boards|job-boards)\./, '')
    return host
  } catch {
    return 'Unknown'
  }
}
