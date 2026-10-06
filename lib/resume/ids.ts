/**
 * Stable ids for profile items, highlights and wordings: short, lowercase,
 * URL-safe (`ID_PATTERN` in ./types). Random, never derived from content,
 * so editing a highlight keeps the id variants and case studies point at.
 */
export function newId(prefix = ''): string {
  const raw = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
  return safePrefix ? `${safePrefix}-${raw}` : raw
}

export type IdFactory = () => string
