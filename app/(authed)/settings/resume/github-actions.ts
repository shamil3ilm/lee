'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as statsQ from '@/lib/db/queries/githubRepoStats'
import { saveProfile } from '@/lib/profile/service'
import { isRepoFullName } from '@/lib/integrations/github/api'
import { applyRepoSuggestion, buildRepoSuggestion } from '@/lib/integrations/github/evidence'
import { suggestRadarFollows, type FollowSuggestion } from '@/lib/integrations/github/follow'
import { refreshRepoStats } from '@/lib/integrations/github/repo-stats'
import { logger } from '@/lib/logger'
import { cleanProjectIds } from '@/lib/radar/new/projects'
import { loadPersonalContext } from '@/lib/radar/new/personal'
import { getResumeProfile, ResumeValidationError, saveResumeProfile } from '@/lib/resume/service'
import { idSchema } from '@/lib/resume/types'

/**
 * Settings › Résumé › From GitHub. Refresh the repo cache, link a repo to a
 * profile project (evidence only), import its description / topics as a
 * confirmed suggestion, and the Radar follow suggestions (confirmed too).
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export async function refreshGitHubReposAction(): Promise<Result<{ refreshed: number }>> {
  const userId = await requireUserId()
  try {
    const r = await refreshRepoStats(userId, { force: true })
    if (!r.ok) return r
    revalidatePath('/settings/resume')
    return { ok: true, refreshed: r.refreshed }
  } catch (err) {
    logger.error('github_repos_refresh_failed', { userId, err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not refresh from GitHub.' }
  }
}

export async function linkRepoAction(fullName: string, projectId: string | null): Promise<Result> {
  const userId = await requireUserId()
  if (!isRepoFullName(fullName) || (projectId !== null && !idSchema.safeParse(projectId).success)) return { ok: false, error: 'Invalid link.' }
  if (projectId !== null) {
    const { profile } = await getResumeProfile(userId)
    if (!profile.projects.some((p) => p.id === projectId)) return { ok: false, error: 'That project no longer exists.' }
  }
  const ok = await statsQ.setLink(userId, fullName, projectId)
  if (!ok) return { ok: false, error: 'Refresh from GitHub first.' }
  revalidatePath('/settings/resume')
  return { ok: true }
}

const acceptSchema = z.object({ description: z.boolean(), keywords: z.array(z.string().max(200)).max(20), url: z.boolean() })

/** The user's confirmation of a repo suggestion: only the ticked parts are written. */
export async function applyRepoSuggestionAction(fullName: string, accept: unknown): Promise<Result> {
  const userId = await requireUserId()
  const parsed = acceptSchema.safeParse(accept)
  if (!isRepoFullName(fullName) || !parsed.success) return { ok: false, error: 'Invalid suggestion.' }
  const repo = await statsQ.get(userId, fullName)
  if (!repo?.linkedProjectId) return { ok: false, error: 'Link the repository to a project first.' }
  try {
    const { profile } = await getResumeProfile(userId)
    const project = profile.projects.find((p) => p.id === repo.linkedProjectId)
    if (!project) return { ok: false, error: 'That project no longer exists.' }
    const suggestion = buildRepoSuggestion(project, repo)
    await saveResumeProfile(userId, applyRepoSuggestion(profile, suggestion, parsed.data))
    revalidatePath('/settings/resume')
    return { ok: true }
  } catch (err) {
    if (err instanceof ResumeValidationError) return { ok: false, error: err.message }
    logger.error('github_repo_suggestion_failed', { userId, err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not update the project.' }
  }
}

export async function setFollowDepsAction(fullName: string, follow: boolean): Promise<Result> {
  const userId = await requireUserId()
  if (!isRepoFullName(fullName) || typeof follow !== 'boolean') return { ok: false, error: 'Invalid setting.' }
  const ok = await statsQ.setFollowDeps(userId, fullName, follow)
  if (!ok) return { ok: false, error: 'Refresh from GitHub first.' }
  revalidatePath('/settings/resume')
  return { ok: true }
}

export async function suggestRadarFollowsAction(): Promise<Result<{ suggestions: FollowSuggestion[]; starredUnavailable: boolean }>> {
  const userId = await requireUserId()
  try {
    const r = await suggestRadarFollows(userId)
    return r.ok ? { ok: true, suggestions: r.suggestions, starredUnavailable: r.starredUnavailable } : r
  } catch (err) {
    logger.error('github_radar_suggest_failed', { userId, err: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Could not read GitHub right now.' }
  }
}

/** Confirmed: add the ticked projects to Radar's release list (keeps the current list). */
export async function addReleaseProjectsAction(ids: unknown): Promise<Result<{ added: number }>> {
  const userId = await requireUserId()
  const parsed = z.array(z.string().max(160)).max(40).safeParse(ids)
  if (!parsed.success) return { ok: false, error: 'Invalid selection.' }
  const current = (await loadPersonalContext(userId)).releaseProjects
  const next = cleanProjectIds([...current, ...parsed.data])
  await saveProfile(userId, { radarReleaseProjects: next })
  revalidatePath('/radar', 'layout')
  revalidatePath('/settings/resume')
  return { ok: true, added: next.length - current.length }
}
