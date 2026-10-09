import type { DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { canonicalUrl } from './urls'
import { resolveLocation } from '@/lib/regions/normalize'
import { countryOf } from '@/lib/regions/tree'

/**
 * Cross-source duplicate check for imported openings: an item is a
 * duplicate when an existing discovery (from any source) has the same
 * canonical link, or the same employer and title in the same country (or
 * where either location is unknown). Pure.
 */

export interface ExistingPosting {
  applyUrl: string | null
  title: string | null
  companyName: string | null
  /** Location field, when known: the same title in another country is not a duplicate. */
  location?: string | null
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/\./g, '')
    // Legal suffixes, including the Gulf ones ("W.L.L.", "K.S.C.P.", "S.A.O.G.", "P.J.S.C.").
    .replace(/\b(inc|llc|ltd|limited|pvt|private|fze|fzco|fz-llc|plc|gmbh|co|wll|ksc|kscc|kscp|sak|sakp|spc|saog|saoc|pjsc|psc|bsc|qpsc|qsc|cjsc)\b/g, ' ')
    .replace(/\(\s*(?:closed|holding|public)\s*\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function employerTitleKey(companyName: string | null | undefined, title: string | null | undefined): string | null {
  const c = norm(companyName)
  const t = norm(title)
  return c && t ? `${c}|${t}` : null
}

/**
 * The countries a location names, sorted ("kw", "ae|kw"); "" when unknown.
 * The same employer and title in another country is another opening: a
 * group hiring a "Data Analyst" in Dubai and in Kuwait City posts two.
 */
export function countryKey(location: string | null | undefined): string {
  const ids = resolveLocation(location, { trustCodes: true }).places.map((p) => countryOf(p.id)).filter((c): c is string => Boolean(c))
  return [...new Set(ids)].sort().join('|')
}

export interface DedupeKeys {
  urls: Set<string>
  /** employer|title → the country keys seen for it ("" = location unknown). */
  pairs: Map<string, Set<string>>
}

function addPair(pairs: Map<string, Set<string>>, key: string, country: string): void {
  pairs.set(key, new Set([...(pairs.get(key) ?? []), country]))
}

/** Same employer and title, and the same country (or either location unknown). */
function samePair(pairs: ReadonlyMap<string, ReadonlySet<string>>, key: string, country: string): boolean {
  const seen = pairs.get(key)
  if (!seen) return false
  return country === '' || seen.has('') || seen.has(country)
}

export function keysOf(postings: readonly ExistingPosting[]): DedupeKeys {
  const urls = new Set<string>()
  const pairs = new Map<string, Set<string>>()
  for (const p of postings) {
    const u = p.applyUrl ? canonicalUrl(p.applyUrl) : null
    if (u) urls.add(u)
    const k = employerTitleKey(p.companyName, p.title)
    if (k) addPair(pairs, k, countryKey(p.location))
  }
  return { urls, pairs }
}

/** Items that are new, in order; later copies of the same posting in the batch are dropped too. */
export function dropDuplicates(items: readonly DiscoveryItem[], existing: DedupeKeys): { fresh: DiscoveryItem[]; duplicates: number } {
  const urls = new Set(existing.urls)
  const pairs = new Map([...existing.pairs].map(([k, v]) => [k, new Set(v)] as const))
  const fresh: DiscoveryItem[] = []
  for (const item of items) {
    const job = item.normalized as NormalizedJob
    const u = job.applyUrl ? canonicalUrl(job.applyUrl) : null
    const k = employerTitleKey(job.companyName, job.title)
    const country = countryKey(job.location)
    if ((u && urls.has(u)) || (k && samePair(pairs, k, country))) continue
    if (u) urls.add(u)
    if (k) addPair(pairs, k, country)
    fresh.push(item)
  }
  return { fresh, duplicates: items.length - fresh.length }
}
