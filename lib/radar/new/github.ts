import { errorText, requestJson } from '@/lib/reputation/http'
import { pastDeadline, type RadarFetchDeps } from '../sources/types'
import { dateOrNull, dayOf, excerptOf, titleOf } from '../text'
import { NEW_WINDOW_DAYS, tractionScore } from './novelty'
import { isMirror, isSpam } from './spam'
import type { NewFetchResult, NewItemInput } from './types'

/**
 * New repositories on GitHub (Search API under GitHub's API terms; 10
 * searches a minute without a token, 30 with the optional one — the shared
 * host limiter keeps 6.5 s). Repos CREATED in the last 30 days with the
 * most stars, across topics beyond AI; forks and archived repos are
 * excluded in the query, mirrors and spam after it.
 */

export const GITHUB_API = 'https://api.github.com'
const PER_QUERY = 10
const DAY_MS = 86_400_000

export interface RepoQuery {
  id: string
  /** Search qualifiers before the date and star filters. */
  q: string
  minStars: number
}

/** One search each per daily run (≈ 13 × 6.5 s ≈ 85 s unauthenticated). */
export const NEW_REPO_QUERIES: readonly RepoQuery[] = [
  { id: 'agents', q: 'topic:agents', minStars: 50 },
  { id: 'llm', q: 'topic:llm', minStars: 50 },
  { id: 'inference', q: 'topic:inference', minStars: 30 },
  { id: 'mcp', q: 'topic:mcp', minStars: 30 },
  { id: 'devtools', q: 'topic:developer-tools', minStars: 30 },
  { id: 'database', q: 'topic:database', minStars: 20 },
  { id: 'web framework', q: 'topic:framework', minStars: 30 },
  { id: 'laravel', q: 'topic:laravel', minStars: 10 },
  { id: 'php', q: 'language:php', minStars: 20 },
  { id: 'typescript', q: 'language:typescript', minStars: 100 },
  { id: 'python', q: 'language:python', minStars: 100 },
  { id: 'data', q: 'topic:analytics', minStars: 15 },
  { id: 'security', q: 'topic:security', minStars: 30 },
]

interface Repo {
  id?: number
  full_name?: string
  html_url?: string
  description?: string | null
  stargazers_count?: number
  created_at?: string
  topics?: unknown
  language?: string | null
  fork?: boolean
  archived?: boolean
  license?: { spdx_id?: string | null } | null
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function newRepoQueryUrl(query: RepoQuery, now: Date): string {
  const since = day(new Date(now.getTime() - NEW_WINDOW_DAYS.github * DAY_MS))
  const q = `${query.q} created:>${since} stars:>=${query.minStars} fork:false archived:false`
  return `${GITHUB_API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_QUERY}`
}

export function toNewRepoItems(body: unknown, query: Pick<RepoQuery, 'id' | 'minStars'>, now: Date): NewItemInput[] {
  const raw = (body as { items?: unknown } | null)?.items
  const repos = Array.isArray(raw) ? (raw as Repo[]) : []
  return repos.flatMap((r): NewItemInput[] => {
    if (!r.full_name || !r.html_url || r.fork || r.archived || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(r.html_url)) return []
    const stars = typeof r.stargazers_count === 'number' ? r.stargazers_count : 0
    const description = r.description ?? ''
    const name = r.full_name.split('/')[1] ?? r.full_name
    if (stars < query.minStars || isMirror(name, description) || isSpam(r.full_name, [], description)) return []
    const topics = Array.isArray(r.topics) ? r.topics.filter((t): t is string => typeof t === 'string').slice(0, 8) : []
    const created = dateOrNull(r.created_at)
    const license = r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : undefined
    const excerpt = [description, topics.length > 0 ? `Topics: ${topics.slice(0, 6).join(', ')}` : '', r.language ?? '']
      .filter(Boolean)
      .join(' — ')
    return [
      {
        source: 'github',
        externalId: String(r.id ?? r.full_name.toLowerCase()),
        kind: 'repo',
        title: titleOf(r.full_name),
        url: r.html_url,
        publishedAt: created,
        excerpt: excerptOf(excerpt),
        category: 'tool',
        // A public repository with a licence is open source; without one it is merely public.
        openness: license ? 'open' : null,
        group: 'repo',
        entityKey: `gh:${r.full_name.toLowerCase()}`,
        createdAt: created,
        tags: [...new Set([query.id, ...topics, ...(r.language ? [r.language] : [])].map((t) => t.toLowerCase()))],
        traction: tractionScore('github', stars, created, now),
        metrics: { stars, createdAt: dayOf(r.created_at), repoId: r.full_name, license, language: r.language ?? undefined },
      },
    ]
  })
}

export async function fetchGithubNew(deps: RadarFetchDeps & { queries?: readonly RepoQuery[] } = {}): Promise<NewFetchResult> {
  const now = deps.now ?? new Date()
  const init: RequestInit = {
    headers: {
      'x-github-api-version': '2022-11-28',
      ...(deps.githubToken ? { authorization: `Bearer ${deps.githubToken}` } : {}),
    },
  }
  const items: NewItemInput[] = []
  const partialErrors: string[] = []
  for (const query of deps.queries ?? NEW_REPO_QUERIES) {
    if (pastDeadline(deps)) break
    try {
      const body = await requestJson('github', newRepoQueryUrl(query, now), deps, init, { accept: 'application/vnd.github+json' })
      items.push(...toNewRepoItems(body, query, now))
    } catch (e) {
      partialErrors.push(`${query.id}: ${errorText(e)}`)
      // A rate limit applies to every later search in this run too.
      if (/429|403/.test(errorText(e))) break
    }
  }
  if (items.length === 0 && partialErrors.length > 0) throw new Error(partialErrors[0])
  return { items, partialErrors }
}
