import { errorText, requestJson } from '@/lib/reputation/http'
import { HN_API } from '@/lib/reputation/sources/hn'
import { pastDeadline, type RadarFetchDeps } from '../sources/types'
import { arxivIdOf, dateOrNull, excerptOf, titleOf } from '../text'
import { NEW_WINDOW_DAYS, tractionScore } from './novelty'
import { isSpam } from './spam'
import type { NewFetchResult, NewItemInput } from './types'

/**
 * Hacker News (Algolia API, free, no key, 10,000 requests an hour per IP):
 *   - "Show HN" and "Launch HN" posts of the last week above a points
 *     threshold, kept only when they are about technology;
 *   - stories linking an arXiv paper above a threshold — how "What's new"
 *     ranks arXiv papers by discussion instead of listing every submission.
 * Two requests a day.
 */

export const SHOW_MIN_POINTS = 40
export const PAPER_MIN_POINTS = 30
const HITS = 50

interface Hit {
  objectID?: string
  title?: string | null
  url?: string | null
  points?: number | null
  num_comments?: number | null
  created_at?: string
  created_at_i?: number
  _tags?: unknown
}

const TECH =
  /\b(?:api|apis|app|apps|ai|llms?|gpts?|models?|agents?|agentic|code|coding|coder|open[- ]source|cli|sdks?|library|framework|database|sql|postgres(?:ql)?|sqlite|server|serverless|cloud|kubernetes|docker|linux|rust|python|typescript|javascript|js|php|laravel|react|compiler|browser|editor|terminal|devtools?|developers?|data|analytics|security|encryption|inference|gpus?|ml|neural|search|self[- ]hosted|macos|ios|android|web|plugin|extension|mcp|sandbox|wasm|tool|tools|engine|protocol|automation|programming|repo|git|ide|vm|runtime|chatbot|embedding|rag|vector)\b/i

export function isTech(title: string, url: string | null): boolean {
  return TECH.test(title) || (url !== null && /^https:\/\/(?:github\.com|huggingface\.co|gitlab\.com)\//i.test(url))
}

/** "Show HN: Bigwords.page – Turn any screen into a sign" → "Bigwords.page". */
export function showName(title: string): string {
  const rest = title.replace(/^(?:show|launch) hn:\s*/i, '')
  const name = rest.split(/\s[—–-]\s|:\s/)[0]?.replace(/\s*\((?:YC|yc) [A-Z]\d{2}\)\s*$/, '').trim() ?? rest
  return (name.length >= 2 ? name : rest).slice(0, 120)
}

function hits(body: unknown): Hit[] {
  const raw = (body as { hits?: unknown } | null)?.hits
  return Array.isArray(raw) ? (raw as Hit[]) : []
}

function since(now: Date): number {
  return Math.floor(now.getTime() / 1000) - NEW_WINDOW_DAYS.hn * 86_400
}

export function showLaunchUrl(now: Date): string {
  return `${HN_API}/search?tags=(show_hn,launch_hn)&numericFilters=${encodeURIComponent(`created_at_i>${since(now)},points>=${SHOW_MIN_POINTS}`)}&hitsPerPage=${HITS}`
}

export function arxivStoriesUrl(now: Date): string {
  return `${HN_API}/search?query=arxiv.org&restrictSearchableAttributes=url&tags=story&numericFilters=${encodeURIComponent(`created_at_i>${since(now)},points>=${PAPER_MIN_POINTS}`)}&hitsPerPage=${HITS}`
}

function storyUrl(id: string): string {
  return `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`
}

function link(h: Hit): string | null {
  return typeof h.url === 'string' && /^https?:\/\//i.test(h.url) ? h.url : null
}

export function toShowItems(body: unknown, now: Date): NewItemInput[] {
  return hits(body).flatMap((h): NewItemInput[] => {
    if (!h.objectID || !h.title) return []
    const url = link(h)
    const points = typeof h.points === 'number' ? h.points : 0
    const tags = Array.isArray(h._tags) ? h._tags : []
    const launch = tags.includes('launch_hn') || /^launch hn:/i.test(h.title)
    // Launch HN posts are YC companies' product launches: technology by definition.
    if (points < SHOW_MIN_POINTS || (!launch && !isTech(h.title, url)) || isSpam(h.title)) return []
    const created = dateOrNull(h.created_at ?? h.created_at_i)
    return [
      {
        source: 'hn',
        externalId: h.objectID,
        kind: 'news',
        title: titleOf(h.title),
        name: showName(titleOf(h.title)),
        url: storyUrl(h.objectID),
        publishedAt: created,
        excerpt: excerptOf(`${launch ? 'Launch HN' : 'Show HN'} · ${points} points · ${h.num_comments ?? 0} comments`),
        category: 'news',
        openness: url && /^https:\/\/github\.com\//i.test(url) ? 'open' : null,
        group: launch ? 'launch' : 'show',
        entityKey: `hn:${h.objectID}`,
        createdAt: created,
        tags: [],
        traction: tractionScore('hn', points, created, now),
        metrics: { points, comments: h.num_comments ?? undefined, ...(url ? { links: [url] } : {}) },
      },
    ]
  })
}

export function toArxivStoryItems(body: unknown, now: Date): NewItemInput[] {
  return hits(body).flatMap((h): NewItemInput[] => {
    const url = link(h)
    const arxiv = arxivIdOf(url)
    const points = typeof h.points === 'number' ? h.points : 0
    if (!h.objectID || !h.title || !arxiv || points < PAPER_MIN_POINTS) return []
    const created = dateOrNull(h.created_at ?? h.created_at_i)
    return [
      {
        source: 'hn',
        externalId: h.objectID,
        kind: 'paper',
        title: titleOf(h.title),
        url: `https://arxiv.org/abs/${arxiv}`,
        publishedAt: created,
        excerpt: excerptOf(`Discussed on Hacker News · ${points} points · ${h.num_comments ?? 0} comments`),
        category: 'paper',
        openness: null,
        group: null,
        entityKey: `arxiv:${arxiv}`,
        createdAt: created,
        tags: [],
        traction: tractionScore('hn', points, created, now),
        metrics: { points, comments: h.num_comments ?? undefined, arxivId: arxiv, links: [storyUrl(h.objectID)] },
      },
    ]
  })
}

export async function fetchHnNew(deps: RadarFetchDeps = {}): Promise<NewFetchResult> {
  const now = deps.now ?? new Date()
  const lists = [
    { label: 'hn show/launch', url: showLaunchUrl(now), parse: toShowItems },
    { label: 'hn arxiv', url: arxivStoriesUrl(now), parse: toArxivStoryItems },
  ]
  const items: NewItemInput[] = []
  const partialErrors: string[] = []
  for (const l of lists) {
    if (pastDeadline(deps)) break
    try {
      items.push(...l.parse(await requestJson(l.label, l.url, deps), now))
    } catch (e) {
      partialErrors.push(errorText(e))
    }
  }
  if (items.length === 0 && partialErrors.length > 0) throw new Error(partialErrors[0])
  return { items, partialErrors }
}
