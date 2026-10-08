import { errorText, requestJson } from '@/lib/reputation/http'
import { cleanTerm } from '../match'
import { dateOrNull, dayOf, excerptOf, titleOf } from '../text'
import type { RadarItemInput } from '../types'
import { pastDeadline, termsForRun, type RadarFetchDeps, type RadarFetchResult } from './types'

/**
 * GitHub Search API (free; 10 search requests a minute without a token,
 * 30 with the optional token from Settings › AI). Rising repos: created in
 * the last week under a few AI topics, by stars; plus repos naming a watch
 * term in their name or description, pushed in the last month.
 */

export const GITHUB_API = 'https://api.github.com'
export const RADAR_TOPICS = ['llm', 'agents', 'inference'] as const
const PER_TOPIC = 15
const PER_TERM = 10
const MAX_TERMS = 3
const DAY_MS = 86_400_000

interface Repo {
  id?: number
  full_name?: string
  html_url?: string
  description?: string | null
  stargazers_count?: number
  created_at?: string
  pushed_at?: string
  topics?: unknown
  fork?: boolean
}

export function toRepoItems(body: unknown): RadarItemInput[] {
  const raw = (body as { items?: unknown } | null)?.items
  const repos = Array.isArray(raw) ? (raw as Repo[]) : []
  return repos.flatMap((r): RadarItemInput[] => {
    if (!r.full_name || !r.html_url || r.fork || !/^https:\/\/github\.com\//.test(r.html_url)) return []
    const topics = Array.isArray(r.topics) ? r.topics.filter((t): t is string => typeof t === 'string').slice(0, 6) : []
    const excerpt = [r.description ?? '', topics.length > 0 ? `Topics: ${topics.join(', ')}` : ''].filter(Boolean).join(' — ')
    return [
      {
        source: 'github',
        externalId: String(r.id ?? r.full_name.toLowerCase()),
        kind: 'repo',
        title: titleOf(r.full_name),
        url: r.html_url,
        publishedAt: dateOrNull(r.created_at),
        excerpt: excerptOf(excerpt),
        metrics: {
          stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : undefined,
          createdAt: dayOf(r.created_at),
          repoId: r.full_name,
        },
      },
    ]
  })
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function topicQuery(topic: string, now: Date): string {
  const q = `topic:${topic} created:>${day(new Date(now.getTime() - 7 * DAY_MS))}`
  return `${GITHUB_API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_TOPIC}`
}

export function termQuery(term: string, now: Date): string {
  const phrase = cleanTerm(term).replace(/"/g, '')
  const q = `"${phrase}" in:name,description pushed:>${day(new Date(now.getTime() - 30 * DAY_MS))}`
  return `${GITHUB_API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_TERM}`
}

export async function fetchGithub(deps: RadarFetchDeps = {}): Promise<RadarFetchResult> {
  const now = deps.now ?? new Date()
  const init: RequestInit = {
    headers: {
      'x-github-api-version': '2022-11-28',
      ...(deps.githubToken ? { authorization: `Bearer ${deps.githubToken}` } : {}),
    },
  }
  const opts = { accept: 'application/vnd.github+json' }
  const urls = [
    ...RADAR_TOPICS.map((t) => ({ label: `topic ${t}`, url: topicQuery(t, now) })),
    ...termsForRun(deps, MAX_TERMS).map((t) => ({ label: 'term', url: termQuery(t.term, now) })),
  ]
  const items: RadarItemInput[] = []
  const partialErrors: string[] = []
  for (const u of urls) {
    if (pastDeadline(deps)) break
    try {
      items.push(...toRepoItems(await requestJson('github', u.url, deps, init, opts)))
    } catch (e) {
      partialErrors.push(`${u.label}: ${errorText(e)}`)
      // A rate limit applies to every later search in this run too.
      if (/429|403/.test(errorText(e))) break
    }
  }
  if (items.length === 0 && partialErrors.length > 0) throw new Error(partialErrors[0])
  return { items, partialErrors }
}
