import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { logger } from '@/lib/logger'
import { getResumeProfile, saveResumeProfile } from '@/lib/resume/service'
import type { ResumeProfile } from '@/lib/resume/types'
import { resolveServiceSecret } from '@/lib/settings/secrets'
import { checkPortfolioProfile } from './checks'
import { PORTFOLIO_TOKEN_ID, publishConfigSchema, toTarget, type RepoTarget } from './config'
import { diffDocuments, type Choices, type DiffSection, type SectionDiff } from './diff'
import { getFile, putFile, type RemoteFile } from './github'
import {
  contentHash,
  formatLastModified,
  nextVersion,
  serializeProfileJson,
  toJsonResume,
  type JsonDoc,
} from './map'
import { applyRepoSections } from './reverse'

/**
 * Publish the master profile's public fields to the portfolio repo.
 *
 *  1. GET profile.json (its sha).
 *  2. sha ≠ the one lee last wrote → it was edited by hand: return a
 *     field-level diff (repo vs lee) and wait for the user's choice. Nothing
 *     is ever overwritten silently.
 *  3. With a resolution: re-GET; still the same sha → apply "take repo"
 *     sections to the master profile, then PUT with that sha.
 *  4. PUT 409/422 (changed in between) → re-fetch and return the diff.
 *  5. Record sha, content hash, version and commit.
 */

export const COMMIT_SUBJECT = 'chore(profile): sync from lee'

export type ConflictReason = 'edited' | 'deleted' | 'changed_during_publish' | 'unreadable'

export type PublishOutcome =
  | { status: 'published'; version: string; commitUrl: string | null; commitSha: string; publishedAt: string }
  | { status: 'up_to_date' }
  | { status: 'conflict'; reason: ConflictReason; repoSha: string | null; diff: SectionDiff[] }
  | { status: 'invalid'; errors: string[] }
  | { status: 'not_configured'; error: string }

export interface Resolution {
  /** The repo sha the user resolved against (null = file missing). */
  repoSha: string | null
  choices: Choices
}

interface Context {
  userId: string
  target: RepoTarget
  token: string
  state: publishQ.PortfolioPublishRow
  now: Date
}

async function loadContext(userId: string, now: Date): Promise<Context | { error: string }> {
  const state = await publishQ.get(userId)
  const config = state ? publishConfigSchema.safeParse(state) : null
  if (!state || !config?.success) return { error: 'Set the repository, branch and path first.' }
  const { key } = await resolveServiceSecret(userId, PORTFOLIO_TOKEN_ID)
  if (!key) return { error: 'Save a GitHub token first.' }
  return { userId, target: toTarget(config.data), token: key, state, now }
}

function parseRepo(remote: RemoteFile): JsonDoc | null {
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

function repoVersion(repo: JsonDoc | null): string | null {
  const v = (repo?.meta as JsonDoc | undefined)?.version
  return typeof v === 'string' ? v : null
}

function conflict(reason: ConflictReason, remote: RemoteFile, repo: JsonDoc | null, lee: JsonDoc): PublishOutcome {
  const diff = diffDocuments(repo ?? {}, lee)
  logger.warn('profile_publish_conflict', { reason, sections: diff.length })
  return { status: 'conflict', reason, repoSha: remote.exists ? remote.sha : null, diff }
}

export function commitMessage(changed: readonly SectionDiff[], created: boolean): string {
  const summary = created
    ? 'First sync of profile.json from lee.'
    : changed.length > 0
      ? `Updated: ${changed.map((d) => d.section).join(', ')}.`
      : 'Refreshed metadata.'
  return `${COMMIT_SUBJECT}\n\n${summary}`
}

/** Preview: the JSON lee would publish and the portfolio build's verdict on it. */
export async function previewPublish(userId: string, now = new Date()): Promise<{ json: string; errors: string[] }> {
  const [{ profile }, state] = await Promise.all([getResumeProfile(userId), publishQ.get(userId)])
  const doc = buildDocument(profile, state?.lastVersion ?? null, now)
  return { json: serializeProfileJson(doc), errors: checkPortfolioProfile(doc) }
}

export async function publishProfile(
  userId: string,
  opts: { resolution?: Resolution; now?: Date } = {},
): Promise<PublishOutcome> {
  const ctx = await loadContext(userId, opts.now ?? new Date())
  if ('error' in ctx) return { status: 'not_configured', error: ctx.error }
  const remote = await getFile(ctx.target, ctx.token)
  const repo = parseRepo(remote)
  let { profile } = await getResumeProfile(userId)
  const previous = ctx.state.lastVersion ?? repoVersion(repo)

  if (opts.resolution) {
    const currentSha = remote.exists ? remote.sha : null
    if (currentSha !== opts.resolution.repoSha) {
      return conflict('changed_during_publish', remote, repo, buildDocument(profile, previous, ctx.now))
    }
    const fromRepo = Object.entries(opts.resolution.choices)
      .filter(([, side]) => side === 'repo')
      .map(([s]) => s as DiffSection)
    if (fromRepo.length > 0 && repo) profile = (await saveResumeProfile(userId, applyRepoSections(profile, repo, fromRepo))).profile
  } else if (remote.exists && remote.sha !== ctx.state.lastSha) {
    const lee = buildDocument(profile, previous, ctx.now)
    if (!repo) return conflict('unreadable', remote, null, lee)
    if (diffDocuments(repo, lee).length > 0) return conflict('edited', remote, repo, lee)
  } else if (!remote.exists && ctx.state.lastSha) {
    return conflict('deleted', remote, null, buildDocument(profile, previous, ctx.now))
  }

  const doc = buildDocument(profile, previous, ctx.now)
  const errors = checkPortfolioProfile(doc)
  if (errors.length > 0) return { status: 'invalid', errors }
  const hash = contentHash(doc)
  if (remote.exists && repo && contentHash(repo) === hash) {
    await publishQ.recordPublish(userId, {
      lastSha: remote.sha,
      lastHash: hash,
      lastVersion: repoVersion(repo) ?? previous ?? nextVersion(null),
      lastCommitSha: ctx.state.lastCommitSha,
      lastCommitUrl: ctx.state.lastCommitUrl,
      publishedAt: ctx.state.publishedAt,
    })
    return { status: 'up_to_date' }
  }

  const changed = repo ? diffDocuments(repo, doc) : []
  const put = await putFile(ctx.target, ctx.token, {
    text: serializeProfileJson(doc),
    message: commitMessage(changed, !remote.exists),
    sha: remote.exists ? remote.sha : null,
  })
  if (!put.ok) {
    const fresh = await getFile(ctx.target, ctx.token)
    return conflict('changed_during_publish', fresh, parseRepo(fresh), doc)
  }
  const version = ((doc.meta as JsonDoc).version as string) ?? nextVersion(previous)
  await publishQ.recordPublish(userId, {
    lastSha: put.contentSha,
    lastHash: hash,
    lastVersion: version,
    lastCommitSha: put.commitSha,
    lastCommitUrl: put.commitUrl,
    publishedAt: ctx.now,
  })
  logger.info('profile_published', { version, sections: changed.length, created: !remote.exists })
  return { status: 'published', version, commitUrl: put.commitUrl, commitSha: put.commitSha, publishedAt: ctx.now.toISOString() }
}
