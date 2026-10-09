import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { getResumeProfile } from '@/lib/resume/service'
import type { ResumeProfile } from '@/lib/resume/types'
import { resolvePortfolioToken, type PortfolioTokenVia } from '@/lib/integrations/github/publish-token'
import { checkPortfolioProfile } from './checks'
import { publishConfigSchema, toTarget, type RepoTarget } from './config'
import type { RemoteFile } from './github'
import { formatLastModified, nextVersion, serializeProfileJson, toJsonResume, type JsonDoc } from './map'

/**
 * Shared plumbing for the portfolio repository: the repo target + token
 * (lib/portfolio/source.ts reads profile.json with it, variant-publish.ts
 * writes variants/<slug>.json with it) and the document lee would write.
 *
 * The main profile.json is NOT written by lee: the portfolio is the source
 * of the public facts and lee pulls it (lib/portfolio/pull.ts). A future
 * write-through (commit to profile.json, then re-pull) belongs behind
 * PROFILE_EDIT_IN_LEE in lib/portfolio/sync-flags.ts, built from
 * `buildDocument` + `putFile` with the last pulled sha.
 */

export type ConflictReason = 'edited' | 'deleted' | 'changed_during_publish' | 'unreadable'

export interface PublishContext {
  userId: string
  target: RepoTarget
  token: string
  /** Connect GitHub's installation token ('app') or the fine-grained token ('token'). */
  via: PortfolioTokenVia
  state: publishQ.PortfolioPublishRow
  now: Date
}

/** Repo target, token and publish state, or why the repository can't be used yet. */
export async function loadPublishContext(userId: string, now: Date): Promise<PublishContext | { error: string }> {
  const state = await publishQ.get(userId)
  const config = state ? publishConfigSchema.safeParse(state) : null
  if (!state || !config?.success) return { error: 'Set the repository, branch and path first.' }
  const target = toTarget(config.data)
  const resolved = await resolvePortfolioToken(userId, target, now)
  if (!resolved) return { error: 'Connect GitHub or save a GitHub token first.' }
  return { userId, target, token: resolved.token, via: resolved.via, state, now }
}

export function parseRepo(remote: RemoteFile): JsonDoc | null {
  if (!remote.exists) return null
  try {
    const v = JSON.parse(remote.text) as unknown
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as JsonDoc) : null
  } catch {
    return null
  }
}

/** The document lee would write now (version bumped from the last one known). */
export function buildDocument(profile: ResumeProfile, previousVersion: string | null, now: Date): JsonDoc {
  return toJsonResume(profile, { version: nextVersion(previousVersion), lastModified: formatLastModified(now) })
}

export function repoVersion(repo: JsonDoc | null): string | null {
  const v = (repo?.meta as JsonDoc | undefined)?.version
  return typeof v === 'string' ? v : null
}

/** lee's copy of profile.json (its public facts) and the portfolio build's verdict on it. */
export async function previewPublish(userId: string, now = new Date()): Promise<{ json: string; errors: string[] }> {
  const [{ profile }, state] = await Promise.all([getResumeProfile(userId), publishQ.get(userId)])
  const doc = buildDocument(profile, state?.lastVersion ?? null, now)
  return { json: serializeProfileJson(doc), errors: checkPortfolioProfile(doc) }
}
