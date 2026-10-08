import { OFFICIAL_HOSTS } from '../feeds-catalog'
import { arxivIdOf } from '../text'
import type { RadarMetrics } from '../types'
import type { PrimarySourceKind } from './types'

/**
 * Primary sources for a brief, chosen ONLY from the official URLs of the
 * entry's own items: an official blog post (an item from an official
 * feed), a repository's README, a Hugging Face model card, or a paper's
 * arXiv abstract page. News reports and discussions are never primary.
 * A brief needs at least MIN_PRIMARY_SOURCES of them fetched. Pure.
 */

export const MIN_PRIMARY_SOURCES = 2
export const MAX_PRIMARY_SOURCES = 4

export interface ItemRef {
  source: string
  kind: string
  title: string
  url: string
  excerpt: string
  metrics: RadarMetrics
}

export interface PrimaryCandidate {
  kind: PrimarySourceKind
  /** What a reader opens. */
  url: string
  /** What lee fetches (a raw README instead of the rendered page). */
  fetchUrl: string
  title: string
  /** Offline stand-in (E2E fixtures): the item's own title and excerpt. */
  fallbackText: string
}

const PRIORITY: Readonly<Record<PrimarySourceKind, number>> = {
  official_post: 0,
  repo_readme: 1,
  model_card: 2,
  paper_abstract: 3,
}

/** Path segments of an https URL on `host` (case kept), or null. */
function segments(url: string, host: string): string[] | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname.replace(/^www\./, '').toLowerCase() !== host) return null
    return u.pathname.split('/').filter(Boolean)
  } catch {
    return null
  }
}

const NAME = /^[\w.-]+$/

function githubRepo(url: string): string | null {
  const p = segments(url, 'github.com')
  return p && p.length >= 2 && NAME.test(p[0] as string) && NAME.test(p[1] as string) ? `${p[0]}/${p[1]}` : null
}

/** A Hugging Face model repo path ("org/name"); Spaces, datasets and site pages are not model cards. */
function hfModel(url: string): string | null {
  const p = segments(url, 'huggingface.co')
  if (!p || p.length < 2 || ['spaces', 'datasets', 'papers', 'blog', 'docs', 'api'].includes(p[0] as string)) return null
  return NAME.test(p[0] as string) && NAME.test(p[1] as string) ? `${p[0]}/${p[1]}` : null
}

function fromUrl(url: string, title: string, fallbackText: string): PrimaryCandidate | null {
  const arxiv = arxivIdOf(url)
  if (arxiv) return { kind: 'paper_abstract', url: `https://arxiv.org/abs/${arxiv}`, fetchUrl: `https://arxiv.org/abs/${arxiv}`, title, fallbackText }
  const repo = githubRepo(url)
  if (repo) {
    return {
      kind: 'repo_readme',
      url: `https://github.com/${repo}`,
      fetchUrl: `https://raw.githubusercontent.com/${repo}/HEAD/README.md`,
      title,
      fallbackText,
    }
  }
  const hf = hfModel(url)
  if (hf) {
    return { kind: 'model_card', url: `https://huggingface.co/${hf}`, fetchUrl: `https://huggingface.co/${hf}/raw/main/README.md`, title, fallbackText }
  }
  return null
}

function isOfficialPost(item: ItemRef): boolean {
  if (item.source !== 'feeds' || !item.url.startsWith('https://')) return false
  const host = new URL(item.url).hostname.replace(/^www\./, '')
  // Posts live on the feed's own site (or a subdomain of it).
  return [...OFFICIAL_HOSTS].some((h) => host === h || host.endsWith(`.${h}`) || h.endsWith(`.${host}`))
}

export function primaryCandidates(items: readonly ItemRef[]): PrimaryCandidate[] {
  const out: PrimaryCandidate[] = []
  const seen = new Set<string>()
  const push = (c: PrimaryCandidate | null): void => {
    if (!c || seen.has(c.fetchUrl)) return
    seen.add(c.fetchUrl)
    out.push(c)
  }
  for (const item of items) {
    const fallback = `${item.title}. ${item.excerpt}`.trim()
    if (isOfficialPost(item)) {
      push({ kind: 'official_post', url: item.url, fetchUrl: item.url, title: item.title, fallbackText: fallback })
      continue
    }
    if (item.metrics.arxivId) push(fromUrl(`https://arxiv.org/abs/${item.metrics.arxivId}`, item.title, fallback))
    if (item.source !== 'hn' && item.source !== 'gdelt') push(fromUrl(item.url, item.title, fallback))
    // A story's or paper's own link to a repo or model is official too.
    for (const link of item.metrics.links ?? []) push(fromUrl(link, item.title, fallback))
  }
  return out.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]).slice(0, MAX_PRIMARY_SOURCES)
}
