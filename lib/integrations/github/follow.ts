import * as statsQ from '@/lib/db/queries/githubRepoStats'
import * as connQ from '@/lib/db/queries/integrationConnections'
import { logger } from '@/lib/logger'
import { loadPersonalContext } from '@/lib/radar/new/personal'
import { releaseProject } from '@/lib/radar/new/projects'
import { IntegrationHttpError } from '../http'
import { consumeRateLimit, RATE_RULES } from '../rate-limit'
import { getFileText, listStarred } from './api'
import { projectsFromComposerJson, projectsFromPackageJson, projectsFromStarred } from './dependencies'
import { getGitHubUserToken } from './token'

/**
 * SERVER-ONLY. Radar suggestions from GitHub: the user's starred repos
 * (when they turned "Follow my starred repos" on) and the dependencies of
 * repos they ticked "Follow its dependencies" for (package.json /
 * composer.json read through the API). Only SUGGESTED: the user confirms
 * before anything is added to the release list (setReleaseProjectsAction).
 */

export interface FollowSuggestion {
  id: string
  label: string
  /** Why: "starred" or the repo it comes from. */
  from: string
}

export type FollowResult = { ok: true; suggestions: FollowSuggestion[]; starredUnavailable: boolean } | { ok: false; error: string }

const MAX_DEP_REPOS = 5

export async function suggestRadarFollows(userId: string, now: Date = new Date()): Promise<FollowResult> {
  if (!(await consumeRateLimit(userId, 'github_follow', RATE_RULES.test, now))) return { ok: false, error: 'Too many requests. Please wait a few minutes.' }
  const token = await getGitHubUserToken(userId, now)
  if (!token.ok) return { ok: false, error: 'Connect GitHub first.' }
  const [conn, stats, personal] = await Promise.all([connQ.get(userId, 'github'), statsQ.list(userId), loadPersonalContext(userId)])
  const current = new Set(personal.releaseProjects)
  const found = new Map<string, string>()
  let starredUnavailable = false
  if (conn?.settings.followStarred === true) {
    try {
      for (const id of projectsFromStarred(await listStarred(token.cfg, token.token))) if (!found.has(id)) found.set(id, 'starred')
    } catch (e) {
      // 403: the app was not granted "Starring: read".
      starredUnavailable = true
      logger.warn('github_starred_failed', { userId, status: e instanceof IntegrationHttpError ? e.status : null })
    }
  }
  for (const repo of stats.filter((s) => s.followDeps).slice(0, MAX_DEP_REPOS)) {
    try {
      const [pkg, composer] = await Promise.all([
        getFileText(token.cfg, token.token, repo.fullName, 'package.json'),
        getFileText(token.cfg, token.token, repo.fullName, 'composer.json'),
      ])
      const ids = [...(pkg ? projectsFromPackageJson(pkg) : []), ...(composer ? projectsFromComposerJson(composer) : [])]
      for (const id of ids) if (!found.has(id)) found.set(id, repo.fullName)
    } catch (e) {
      logger.warn('github_dependencies_failed', { userId, status: e instanceof IntegrationHttpError ? e.status : null })
    }
  }
  const suggestions = [...found.entries()]
    .filter(([id]) => !current.has(id))
    .map(([id, from]) => ({ id, label: releaseProject(id)?.label ?? id, from }))
    .slice(0, 40)
  return { ok: true, suggestions, starredUnavailable }
}
