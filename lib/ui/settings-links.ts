/**
 * Links into Settings that come back: `?from=<path>` tells the settings
 * page where the user started (Home, Discovery, Shortlist), so setup never
 * strands them deep in Settings. Only internal paths are accepted.
 */

export function safeReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return null
  // Browsers drop tabs and newlines in URLs ("/\t/evil" becomes "//evil"): reject control characters.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  return value
}

export function settingsHref(path: string, from?: string | null, anchor?: string): string {
  const back = safeReturnPath(from)
  const query = back ? `?from=${encodeURIComponent(back)}` : ''
  return `${path}${query}${anchor ? `#${anchor}` : ''}`
}

/**
 * Add `?from=` to a Settings link ("/settings/sources#email-alerts" →
 * "/settings/sources?from=%2F#email-alerts"); other links are unchanged.
 */
export function withReturn(href: string, from: string): string {
  if (!href.startsWith('/settings') || href.includes('?')) return href
  const [path = href, anchor] = href.split('#')
  return settingsHref(path, from, anchor)
}

/** Settings › Search (the search preferences). */
export function searchPrefsHref(from?: string | null, anchor?: string): string {
  return settingsHref('/settings/search', from, anchor)
}
