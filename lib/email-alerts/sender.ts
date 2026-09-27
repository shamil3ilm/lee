import { ALERT_SITES, hostMatches, type AlertSite } from './sites'

/**
 * Which alert site sent a message — only when the sender is verified.
 *
 * The From address alone is trivially forged, so the message must also
 * carry a passing DMARC result for the sender's domain, or a passing DKIM
 * signature from one of the site's domains, in the Authentication-Results
 * header that Gmail's own server (mx.google.com) adds on receipt. Messages
 * without that proof are ignored: a spoofed "alert" can't plant postings.
 */

function domainOf(address: string): string | null {
  const at = address.lastIndexOf('@')
  if (at < 0) return null
  return address.slice(at + 1).trim().toLowerCase().replace(/[>\s]+$/, '') || null
}

/** Authentication-Results values added by Google's receiving server. */
function googleResults(authResults: readonly string[]): string[] {
  return authResults.filter((v) => /^\s*mx\.google\.com\s*;/i.test(v))
}

function passes(result: string, method: 'dkim' | 'dmarc', site: AlertSite): boolean {
  const re =
    method === 'dkim'
      ? /\bdkim=pass\b[^;]*?\bheader\.(?:i=@?|d=)([a-z0-9.-]+)/gi
      : /\bdmarc=pass\b[^;]*?\bheader\.from=([a-z0-9.-]+)/gi
  for (const m of result.matchAll(re)) {
    const domain = m[1]?.toLowerCase()
    if (domain && site.senderDomains.some((d) => hostMatches(domain, d))) return true
  }
  return false
}

export interface SenderCheck {
  site: AlertSite
  /** The From address, lowercased. */
  from: string
}

/**
 * @param from the bare From address (already extracted, lowercased)
 * @param authResults every Authentication-Results header value on the message
 */
export function verifyAlertSender(from: string | undefined, authResults: readonly string[]): SenderCheck | null {
  if (!from) return null
  const domain = domainOf(from)
  if (!domain) return null
  const site = ALERT_SITES.find((s) => s.senderDomains.some((d) => hostMatches(domain, d)))
  if (!site) return null
  const results = googleResults(authResults)
  const verified = results.some((r) => passes(r, 'dmarc', site) || passes(r, 'dkim', site))
  return verified ? { site, from } : null
}
