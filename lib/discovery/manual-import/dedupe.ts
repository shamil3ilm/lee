import type { DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { canonicalUrl } from './urls'

/**
 * Cross-source duplicate check for imported openings: an item is a
 * duplicate when an existing discovery (from any source) has the same
 * canonical link, or the same employer and title. Pure.
 */

export interface ExistingPosting {
  applyUrl: string | null
  title: string | null
  companyName: string | null
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/\./g, '')
    .replace(/\b(inc|llc|ltd|limited|pvt|private|fze|fzco|fz-llc|plc|gmbh|co)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function employerTitleKey(companyName: string | null | undefined, title: string | null | undefined): string | null {
  const c = norm(companyName)
  const t = norm(title)
  return c && t ? `${c}|${t}` : null
}

export interface DedupeKeys {
  urls: Set<string>
  pairs: Set<string>
}

export function keysOf(postings: readonly ExistingPosting[]): DedupeKeys {
  const urls = new Set<string>()
  const pairs = new Set<string>()
  for (const p of postings) {
    const u = p.applyUrl ? canonicalUrl(p.applyUrl) : null
    if (u) urls.add(u)
    const k = employerTitleKey(p.companyName, p.title)
    if (k) pairs.add(k)
  }
  return { urls, pairs }
}

/** Items that are new, in order; later copies of the same posting in the batch are dropped too. */
export function dropDuplicates(items: readonly DiscoveryItem[], existing: DedupeKeys): { fresh: DiscoveryItem[]; duplicates: number } {
  const urls = new Set(existing.urls)
  const pairs = new Set(existing.pairs)
  const fresh: DiscoveryItem[] = []
  for (const item of items) {
    const job = item.normalized as NormalizedJob
    const u = job.applyUrl ? canonicalUrl(job.applyUrl) : null
    const k = employerTitleKey(job.companyName, job.title)
    if ((u && urls.has(u)) || (k && pairs.has(k))) continue
    if (u) urls.add(u)
    if (k) pairs.add(k)
    fresh.push(item)
  }
  return { fresh, duplicates: items.length - fresh.length }
}
