import { companyJson, type CompanyHttpDeps } from '../http'
import { industriesFromText } from '../industry'
import type { CompanyCandidate } from '../types'

/**
 * GitHub organisations by location (REST Search API, `type:org
 * location:"Dubai"`), a signal of a local engineering team. Search: 10
 * requests a minute without a token, 30 with one (the host limiter keeps
 * 6.5 s). An org's profile (name, blog = website, location, public repos)
 * and its recent repos' languages are read during enrichment, one org at a
 * time. Orgs only — never user accounts (`type:org`); no people data.
 */

export const GITHUB_API = 'https://api.github.com'
export const ORGS_PER_LOCATION = 50
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

function headers(deps: CompanyHttpDeps): Record<string, string> {
  return {
    'x-github-api-version': '2022-11-28',
    ...(deps.githubToken ? { authorization: `Bearer ${deps.githubToken}` } : {}),
  }
}

/** GitHub search returns at most the first 1,000 results of a query. */
export const SEARCH_RESULT_CAP = 1000

/** The search URL for one location term (quoted; at most 40 characters of letters and spaces). */
export function orgSearchUrl(term: string, perPage = ORGS_PER_LOCATION, page = 1): string {
  const clean = term.replace(/[^\p{L} .-]/gu, '').trim().slice(0, 40)
  const q = `type:org location:"${clean}"`
  const p = Math.max(1, Math.min(100, Math.floor(page)))
  return `${GITHUB_API}/search/users?q=${encodeURIComponent(q)}&sort=repositories&order=desc&per_page=${Math.min(100, perPage)}${p > 1 ? `&page=${p}` : ''}`
}

/** Pages a search has (total_count, capped at the 1,000 GitHub serves), at least 1. */
export function searchLastPage(body: unknown, perPage: number): number {
  const total = (body as { total_count?: unknown } | null)?.total_count
  const n = typeof total === 'number' && Number.isFinite(total) ? Math.min(total, SEARCH_RESULT_CAP) : 0
  return Math.max(1, Math.ceil(n / Math.max(1, perPage)))
}

/**
 * One page of the org search for a city. Weekly runs walk the pages (a
 * cursor per term), so every org in the city comes round, not only the
 * first page of the most active ones.
 */
export async function searchOrgsPage(
  term: string,
  regionId: string,
  page: number,
  deps: CompanyHttpDeps = {},
  perPage = ORGS_PER_LOCATION,
): Promise<{ companies: CompanyCandidate[]; lastPage: number }> {
  const body = await companyJson('github-org-search', orgSearchUrl(term, perPage, page), deps, { accept: 'application/vnd.github+json', headers: headers(deps) })
  return { companies: parseOrgSearch(body, regionId), lastPage: searchLastPage(body, perPage) }
}

interface SearchItem {
  login?: unknown
  type?: unknown
  avatar_url?: unknown
}

/** Search JSON → org candidates in `regionId` (profile details come later). */
export function parseOrgSearch(body: unknown, regionId: string): CompanyCandidate[] {
  const items = ((body as { items?: unknown } | null)?.items ?? []) as SearchItem[]
  if (!Array.isArray(items)) return []
  return items.flatMap((it): CompanyCandidate[] => {
    const login = typeof it.login === 'string' ? it.login : ''
    if (!LOGIN.test(login) || it.type !== 'Organization') return []
    const avatar = typeof it.avatar_url === 'string' && it.avatar_url.startsWith('https://avatars.githubusercontent.com/') ? it.avatar_url : undefined
    return [
      {
        name: login,
        regionIds: [regionId],
        industries: [],
        sourceTags: ['github'],
        evidence: { githubLogin: login, ...(avatar ? { logoUrl: `${avatar}&s=64` } : {}) },
      },
    ]
  })
}

export async function searchOrgs(term: string, regionId: string, deps: CompanyHttpDeps = {}, perPage = ORGS_PER_LOCATION): Promise<CompanyCandidate[]> {
  const body = await companyJson('github-org-search', orgSearchUrl(term, perPage), deps, { accept: 'application/vnd.github+json', headers: headers(deps) })
  return parseOrgSearch(body, regionId)
}

export interface OrgProfile {
  name: string | null
  website: string | null
  location: string | null
  description: string | null
  publicRepos: number
}

/** GET /orgs/{login} → the public profile fields lee keeps. */
export function parseOrgProfile(body: unknown): OrgProfile {
  const b = (body ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null)
  const blog = str(b.blog)
  return {
    name: str(b.name),
    website: blog ? (/^https?:\/\//i.test(blog) ? blog : `https://${blog}`) : null,
    location: str(b.location),
    description: str(b.description),
    publicRepos: typeof b.public_repos === 'number' ? b.public_repos : 0,
  }
}

/** Languages of an org's recent repos, most frequent first (forks and archived skipped). */
export function parseRepoLanguages(body: unknown): string[] {
  const repos = Array.isArray(body) ? (body as Array<Record<string, unknown>>) : []
  const counts = new Map<string, number>()
  for (const r of repos) {
    if (r.fork === true || r.archived === true) continue
    const lang = typeof r.language === 'string' ? r.language : null
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([l]) => l)
}

export interface OrgDetails {
  profile: OrgProfile
  languages: string[]
}

/** Two requests: the org profile and its 30 most recently pushed repos. */
export async function fetchOrgDetails(login: string, deps: CompanyHttpDeps = {}): Promise<OrgDetails> {
  if (!LOGIN.test(login)) throw new Error('github-org: invalid login')
  const opts = { accept: 'application/vnd.github+json', headers: headers(deps) }
  const profile = parseOrgProfile(await companyJson('github-org', `${GITHUB_API}/orgs/${login}`, deps, opts))
  const languages = parseRepoLanguages(await companyJson('github-org-repos', `${GITHUB_API}/orgs/${login}/repos?sort=pushed&per_page=30&type=public`, deps, opts))
  return { profile, languages }
}

/** Fold org details into a candidate: the real name, website, industries from its bio. */
export function withOrgDetails(c: CompanyCandidate, d: OrgDetails): CompanyCandidate {
  return {
    ...c,
    name: d.profile.name ?? c.name,
    website: c.website ?? d.profile.website ?? undefined,
    industries: [...new Set([...c.industries, ...industriesFromText(d.profile.description)])],
    evidence: {
      ...c.evidence,
      languages: d.languages,
      publicRepos: d.profile.publicRepos,
      ...(d.profile.description && !c.evidence.description ? { description: d.profile.description.slice(0, 200) } : {}),
    },
  }
}
