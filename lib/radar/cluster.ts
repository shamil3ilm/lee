import { arxivIdOf, canonicalUrl, normalizeName, repoName, truncate } from './text'
import type { RadarItemInput, RadarKind } from './types'

/**
 * Cross-source clustering. Items become one Radar entry when they share a
 * strong key — the same arXiv id, the same canonical URL (a story's link,
 * a paper's repo) or the same repo/model name — or, failing that, when
 * they match the same single watch term ("term:<id>"), so a blog post, an
 * HN story and a repo about one watched name read as one entry. An item
 * matching several terms never adds a term key: that would merge entries
 * of different terms. Pure.
 */

export const MAX_ENTRY_KEYS = 24
const MIN_NAME_KEY = 3
const ENTRY_NAME_MAX = 120

export interface ItemKeys {
  strong: string[]
  term: string[]
}

export interface EntryCandidate {
  id: string
  keys: readonly string[]
}

const NAMED_KINDS: ReadonlySet<RadarKind> = new Set(['model', 'repo', 'dataset'])

export function clusterKeys(item: RadarItemInput, matchedTermIds: readonly string[]): ItemKeys {
  const strong = new Set<string>()
  const arxiv = item.metrics.arxivId ?? arxivIdOf(item.url)
  if (arxiv) strong.add(`arxiv:${arxiv}`)
  for (const u of [item.url, ...(item.metrics.links ?? [])]) {
    const a = arxivIdOf(u)
    if (a) strong.add(`arxiv:${a}`)
    const c = canonicalUrl(u)
    if (c && !isGenericUrl(c)) strong.add(`url:${c}`)
  }
  if (item.metrics.repoId) {
    const name = normalizeName(repoName(item.metrics.repoId))
    if (name.length >= MIN_NAME_KEY) strong.add(`name:${name}`)
  }
  const term = matchedTermIds.length === 1 ? [`term:${matchedTermIds[0]}`] : []
  return { strong: [...strong], term }
}

/** Site roots and listing pages identify nothing. */
function isGenericUrl(canonical: string): boolean {
  return !canonical.includes('/') || /\/(blog|news|papers|search)$/.test(canonical)
}

function overlap(a: readonly string[], b: ReadonlySet<string>): number {
  return a.reduce((n, k) => n + (b.has(k) ? 1 : 0), 0)
}

/**
 * The entry an item joins: the candidate sharing the most strong keys,
 * else one sharing its term key, else null (a new entry).
 */
export function pickEntry(keys: ItemKeys, candidates: readonly EntryCandidate[]): string | null {
  const strong = new Set(keys.strong)
  let best: { id: string; n: number } | null = null
  for (const c of candidates) {
    const n = overlap(c.keys, strong)
    if (n > 0 && (!best || n > best.n)) best = { id: c.id, n }
  }
  if (best) return best.id
  const term = new Set(keys.term)
  return candidates.find((c) => overlap(c.keys, term) > 0)?.id ?? null
}

/** Keys after an item joins (strong first, capped). */
export function mergeKeys(existing: readonly string[], keys: ItemKeys): string[] {
  return [...new Set([...existing, ...keys.strong, ...keys.term])].slice(0, MAX_ENTRY_KEYS)
}

/** Display name of a new entry. */
export function entryNameFor(item: RadarItemInput, singleTermLabel: string | null): string {
  if (NAMED_KINDS.has(item.kind) && item.metrics.repoId) return truncate(repoName(item.metrics.repoId), ENTRY_NAME_MAX)
  if ((item.kind === 'news' || item.kind === 'product') && singleTermLabel) return truncate(singleTermLabel, ENTRY_NAME_MAX)
  return truncate(item.title, ENTRY_NAME_MAX)
}

/** News is the weakest kind: an entry takes the kind of its first non-news item. */
export function mergedKind(current: string, incoming: RadarKind): string {
  return current === 'news' && incoming !== 'news' ? incoming : current
}
