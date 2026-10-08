import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import type { SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { scrubPii } from './pii'

/**
 * Shared wording for AI Mode prompts. Seniority is not a hard limit: the
 * relevance gate treats it as a soft, evidence-based penalty, so prompts ask
 * for junior, mid and senior roles that a few years' experience or a strong
 * domain fit could qualify for. Domains come from the user's role families
 * and keywords (scrubbed), never from the profile itself.
 */

export const EXPERIENCE_HINT = 'about 1–4 years’ experience'
/** Asked of every GCC prompt: the user is not a GCC national. */
export const EXPAT_HINT = 'open to expatriates / foreign applicants (not nationals-only roles)'
const MAX_DOMAINS = 4

export function joinList(items: readonly string[], joiner = 'or'): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${joiner} ${items.at(-1)}`
}

/** "payments, Laravel or integration" from the role families and keywords. */
export function domainsText(prefs: SearchPrefs, pii: readonly string[]): string {
  const domains = [
    ...prefs.roleFamilies.map((id) => roleFamilyLabel(id).split(/\s+\/\s+|\s+Developer|\s+Engineer/)[0]!.trim()),
    ...prefs.include.map((k) => scrubPii(k, pii)),
  ]
    .map((d) => d.trim())
    .filter((d, i, all) => d && all.findIndex((x) => x.toLowerCase() === d.toLowerCase()) === i)
    .slice(0, MAX_DOMAINS)
  return joinList(domains)
}

/**
 * "junior, mid-level and senior roles where about 1–4 years’ experience or
 * a strong payments or integration fit could qualify"
 */
export function levelPhrase(prefs: SearchPrefs, pii: readonly string[] = []): string {
  const domains = domainsText(prefs, pii)
  const fit = domains ? `a strong ${domains} fit` : 'a strong domain fit'
  return `junior, mid-level and senior roles where ${EXPERIENCE_HINT} or ${fit} could qualify`
}
