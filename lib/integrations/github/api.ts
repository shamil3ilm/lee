import type { GitHubAppConfig } from '../config'
import { IntegrationHttpError, integrationFetch, integrationJson } from '../http'
import { createAppJwt } from './app-jwt'

/**
 * SERVER-ONLY. The GitHub REST calls Connect GitHub needs, with a user
 * access token (ghu_) or an installation token (ghs_). Endpoints:
 *   GET  /user                                         (the connected login)
 *   GET  /user/installations                           (this app's installs the user can access)
 *   GET  /user/installations/{id}/repositories         (repos the user granted the app)
 *   POST /app/installations/{id}/access_tokens         (app JWT; 1 h token, narrowed to one repo)
 *   GET  /users/{login}/repos, /user/starred
 *   GET  /repos/{o}/{r}/languages | /commits?author= | /contents/{path}
 *   GET  /search/issues?q=repo:o/r is:pr author:login   (30 requests a minute)
 * https://docs.github.com/en/rest/apps/installations,
 * https://docs.github.com/en/rest/commits/commits#list-commits,
 * https://docs.github.com/en/rest/search/search.
 */

const API_VERSION = '2022-11-28'
const FULL_NAME = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/

export function isRepoFullName(v: unknown): v is string {
  return typeof v === 'string' && FULL_NAME.test(v) && !/\/\.{1,2}$/.test(v)
}

function headers(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': API_VERSION,
    'user-agent': 'lee-github-connect',
    ...extra,
  }
}

function get<T>(cfg: Pick<GitHubAppConfig, 'apiBase'>, token: string, path: string, label: string) {
  return integrationJson<T>(`${cfg.apiBase}${path}`, { bases: [cfg.apiBase], label, init: { headers: headers(token) } })
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export interface GitHubUser {
  id: string
  login: string
  name: string | null
  avatarUrl: string | null
  email: string | null
}

export async function getUser(cfg: Pick<GitHubAppConfig, 'apiBase'>, token: string): Promise<GitHubUser> {
  const { body } = await get<Record<string, unknown>>(cfg, token, '/user', 'github-user')
  const login = str(body.login)
  if (body.id === undefined || !login) throw new IntegrationHttpError('github-user', 200)
  return {
    id: String(body.id),
    login,
    name: str(body.name),
    avatarUrl: str(body.avatar_url)?.startsWith('https://') ? str(body.avatar_url) : null,
    email: str(body.email),
  }
}

export interface Installation {
  id: string
  appId: string
  appSlug: string | null
  account: string | null
  repositorySelection: 'all' | 'selected' | null
  permissions: Record<string, string>
}

export async function listUserInstallations(cfg: Pick<GitHubAppConfig, 'apiBase'>, token: string): Promise<Installation[]> {
  const { body } = await get<{ installations?: Array<Record<string, unknown>> }>(cfg, token, '/user/installations?per_page=100', 'github-installations')
  return (body.installations ?? []).map((i) => {
    const perms = (i.permissions ?? {}) as Record<string, unknown>
    return {
      id: String(i.id),
      appId: String(i.app_id ?? ''),
      appSlug: str(i.app_slug),
      account: str((i.account as Record<string, unknown> | undefined)?.login),
      repositorySelection: i.repository_selection === 'all' || i.repository_selection === 'selected' ? i.repository_selection : null,
      permissions: Object.fromEntries(Object.entries(perms).filter((e): e is [string, string] => typeof e[1] === 'string')),
    }
  })
}

/**
 * This app's installation among the user's, by App ID (or slug). The list
 * also holds org installations the user can merely see, so the one on the
 * user's own account (`preferAccount`) wins when there is one.
 */
export function findAppInstallation(
  list: readonly Installation[],
  cfg: Pick<GitHubAppConfig, 'appId' | 'slug'>,
  preferAccount?: string | null,
): Installation | null {
  const mine = list.filter((i) => i.appId === cfg.appId || (i.appSlug !== null && i.appSlug === cfg.slug))
  const own = preferAccount ? mine.find((i) => i.account?.toLowerCase() === preferAccount.toLowerCase()) : undefined
  return own ?? mine[0] ?? null
}

export interface RepoSummary {
  fullName: string
  isPrivate: boolean
  htmlUrl: string
  description: string | null
  topics: string[]
  stars: number
  pushedAt: Date | null
  fork: boolean
}

function toRepo(r: Record<string, unknown>): RepoSummary | null {
  const fullName = str(r.full_name)
  const htmlUrl = str(r.html_url)
  if (!isRepoFullName(fullName) || !htmlUrl?.startsWith('https://')) return null
  const pushed = str(r.pushed_at)
  return {
    fullName,
    isPrivate: r.private === true,
    htmlUrl,
    description: str(r.description)?.slice(0, 500) ?? null,
    topics: Array.isArray(r.topics) ? r.topics.filter((t): t is string => typeof t === 'string').slice(0, 20) : [],
    stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : 0,
    pushedAt: pushed ? new Date(pushed) : null,
    fork: r.fork === true,
  }
}

export async function listInstallationRepos(cfg: Pick<GitHubAppConfig, 'apiBase'>, token: string, installationId: string): Promise<RepoSummary[]> {
  const out: RepoSummary[] = []
  for (let page = 1; page <= 3; page += 1) {
    const { body } = await get<{ repositories?: Array<Record<string, unknown>>; total_count?: number }>(
      cfg,
      token,
      `/user/installations/${encodeURIComponent(installationId)}/repositories?per_page=100&page=${page}`,
      'github-installation-repos',
    )
    const repos = body.repositories ?? []
    out.push(...repos.map(toRepo).filter((r): r is RepoSummary => r !== null))
    if (repos.length < 100) break
  }
  return out
}

export async function listPublicRepos(cfg: Pick<GitHubAppConfig, 'apiBase'>, token: string, login: string): Promise<RepoSummary[]> {
  const { body } = await get<Array<Record<string, unknown>>>(
    cfg,
    token,
    `/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=50`,
    'github-public-repos',
  )
  return (Array.isArray(body) ? body : []).map(toRepo).filter((r): r is RepoSummary => r !== null)
}

/** Starred repos (needs the optional "Starring: read" account permission). */
export async function listStarred(cfg: Pick<GitHubAppConfig, 'apiBase'>, token: string): Promise<string[]> {
  const { body } = await get<Array<Record<string, unknown>>>(cfg, token, '/user/starred?per_page=100', 'github-starred')
  return (Array.isArray(body) ? body : []).map((r) => str(r.full_name)).filter(isRepoFullName)
}

export async function getLanguages(cfg: Pick<GitHubAppConfig, 'apiBase'>, token: string, fullName: string): Promise<Array<{ name: string; share: number }>> {
  const { body } = await get<Record<string, unknown>>(cfg, token, `/repos/${fullName}/languages`, 'github-languages')
  const entries = Object.entries(body).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
  const total = entries.reduce((s, [, n]) => s + n, 0)
  if (total === 0) return []
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => ({ name: name.slice(0, 40), share: Math.round((n / total) * 100) / 100 }))
}

/** Last page number from a Link header (`rel="last"`), else null. */
export function lastPage(link: string | null): number | null {
  if (!link) return null
  const m = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link)
  return m ? Number(m[1]) : null
}

/** The user's commits on the default branch (per_page=1 → count from the Link header) and the latest date. */
export async function userCommitStats(
  cfg: Pick<GitHubAppConfig, 'apiBase'>,
  token: string,
  fullName: string,
  login: string,
): Promise<{ count: number; lastAt: Date | null }> {
  const res = await integrationFetch(`${cfg.apiBase}/repos/${fullName}/commits?author=${encodeURIComponent(login)}&per_page=1`, {
    bases: [cfg.apiBase],
    label: 'github-commits',
    init: { headers: headers(token) },
  })
  // 409: empty repository.
  if (res.status === 409) return { count: 0, lastAt: null }
  if (!res.ok) throw new IntegrationHttpError('github-commits', res.status)
  const body = (await res.json().catch(() => [])) as Array<{ commit?: { author?: { date?: string } } }>
  const first = Array.isArray(body) ? body[0] : undefined
  const date = first?.commit?.author?.date
  return { count: lastPage(res.headers.get('link')) ?? (Array.isArray(body) ? body.length : 0), lastAt: date ? new Date(date) : null }
}

export async function userPrCount(cfg: Pick<GitHubAppConfig, 'apiBase'>, token: string, fullName: string, login: string): Promise<number> {
  const q = encodeURIComponent(`repo:${fullName} is:pr author:${login}`)
  const { body } = await get<{ total_count?: unknown }>(cfg, token, `/search/issues?q=${q}&per_page=1`, 'github-search-prs')
  return typeof body.total_count === 'number' ? body.total_count : 0
}

/** A small text file from the default branch, or null when absent / too big. */
export async function getFileText(cfg: Pick<GitHubAppConfig, 'apiBase'>, token: string, fullName: string, path: string): Promise<string | null> {
  const res = await integrationFetch(`${cfg.apiBase}/repos/${fullName}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    bases: [cfg.apiBase],
    label: 'github-contents',
    init: { headers: headers(token) },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new IntegrationHttpError('github-contents', res.status)
  const body = (await res.json().catch(() => ({}))) as { type?: unknown; content?: unknown; size?: unknown }
  if (body.type !== 'file' || typeof body.content !== 'string' || (typeof body.size === 'number' && body.size > 200_000)) return null
  return Buffer.from(body.content.replace(/\s/g, ''), 'base64').toString('utf8')
}

/**
 * An installation token narrowed to ONE repository and the given
 * permissions (1 hour). GitHub refuses (422) a repository the installation
 * was not granted — the caller then falls back.
 */
export async function createInstallationToken(
  cfg: GitHubAppConfig,
  installationId: string,
  repo: string,
  permissions: Record<string, 'read' | 'write'>,
  now: Date = new Date(),
): Promise<string> {
  const jwt = createAppJwt(cfg.appId, cfg.privateKey, now)
  const res = await integrationFetch(`${cfg.apiBase}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    bases: [cfg.apiBase],
    label: 'github-installation-token',
    init: {
      method: 'POST',
      headers: { ...headers(jwt), 'content-type': 'application/json' },
      body: JSON.stringify({ repositories: [repo], permissions }),
    },
  })
  if (!res.ok) throw new IntegrationHttpError('github-installation-token', res.status)
  const body = (await res.json().catch(() => ({}))) as { token?: unknown }
  if (typeof body.token !== 'string' || !body.token) throw new IntegrationHttpError('github-installation-token', res.status)
  return body.token
}
