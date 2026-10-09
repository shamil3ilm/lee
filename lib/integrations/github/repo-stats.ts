import * as statsQ from '@/lib/db/queries/githubRepoStats'
import * as connQ from '@/lib/db/queries/integrationConnections'
import { logger } from '@/lib/logger'
import { IntegrationHttpError } from '../http'
import { consumeRateLimit, RATE_RULES } from '../rate-limit'
import { findAppInstallation, getLanguages, listInstallationRepos, listPublicRepos, listUserInstallations, userCommitStats, userPrCount, type RepoSummary } from './api'
import { getGitHubUserToken } from './token'

/**
 * SERVER-ONLY. Refresh the "From GitHub" cache: the user's own public repos
 * plus every repo they granted the app (private ones only if they chose
 * so at install time), newest push first. Per repo: languages, the user's
 * commit count and last commit, the user's PR count. Bounded: at most
 * MAX_REPOS repos and one search call each (search allows 30 a minute);
 * repos refreshed in the last FRESH_MS are skipped unless forced.
 */

export const MAX_REPOS = 15
const FRESH_MS = 12 * 60 * 60_000

export type RefreshResult = { ok: true; refreshed: number; total: number } | { ok: false; error: string }

function merge(a: readonly RepoSummary[], b: readonly RepoSummary[]): RepoSummary[] {
  const byName = new Map<string, RepoSummary>()
  for (const r of [...a, ...b]) if (!byName.has(r.fullName.toLowerCase())) byName.set(r.fullName.toLowerCase(), r)
  return [...byName.values()]
    .filter((r) => !r.fork)
    .sort((x, y) => (y.pushedAt?.getTime() ?? 0) - (x.pushedAt?.getTime() ?? 0))
}

export async function refreshRepoStats(userId: string, opts: { force?: boolean; now?: Date } = {}): Promise<RefreshResult> {
  const now = opts.now ?? new Date()
  if (!(await consumeRateLimit(userId, 'github_refresh_repos', RATE_RULES.refresh_repos, now))) {
    return { ok: false, error: 'Refreshed recently. Please try again later.' }
  }
  const token = await getGitHubUserToken(userId, now)
  if (!token.ok) return { ok: false, error: token.reason === 'expired' ? 'Reconnect GitHub first.' : 'Connect GitHub first.' }
  const conn = await connQ.get(userId, 'github')
  const login = conn?.login
  if (!login) return { ok: false, error: 'Connect GitHub first.' }
  const { cfg } = token
  try {
    const installation = findAppInstallation(await listUserInstallations(cfg, token.token), cfg)
    const granted = installation ? await listInstallationRepos(cfg, token.token, installation.id) : []
    const own = await listPublicRepos(cfg, token.token, login)
    const repos = merge(granted, own).slice(0, MAX_REPOS)
    const cached = new Map((await statsQ.list(userId)).map((r) => [r.fullName, r]))
    let refreshed = 0
    for (const repo of repos) {
      const prev = cached.get(repo.fullName)
      if (!opts.force && prev && now.getTime() - prev.fetchedAt.getTime() < FRESH_MS) continue
      const [languages, commits, prs] = await Promise.all([
        getLanguages(cfg, token.token, repo.fullName).catch(() => prev?.languages ?? []),
        userCommitStats(cfg, token.token, repo.fullName, login).catch(() => ({ count: prev?.userCommits ?? 0, lastAt: prev?.lastCommitAt ?? null })),
        userPrCount(cfg, token.token, repo.fullName, login).catch(() => prev?.userPrs ?? 0),
      ])
      await statsQ.upsert(
        userId,
        {
          fullName: repo.fullName,
          isPrivate: repo.isPrivate,
          htmlUrl: repo.htmlUrl,
          description: repo.description,
          topics: repo.topics,
          languages,
          stars: repo.stars,
          pushedAt: repo.pushedAt,
          lastCommitAt: commits.lastAt,
          userCommits: commits.count,
          userPrs: prs,
        },
        now,
      )
      refreshed += 1
    }
    logger.info('github_repos_refreshed', { userId, refreshed, total: repos.length })
    return { ok: true, refreshed, total: repos.length }
  } catch (e) {
    const status = e instanceof IntegrationHttpError ? e.status : null
    logger.warn('github_repos_refresh_failed', { userId, status })
    return { ok: false, error: status === 401 ? 'GitHub rejected the token. Reconnect GitHub.' : 'Could not reach GitHub. Please try again.' }
  }
}
