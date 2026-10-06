import * as variantsQ from '@/lib/db/queries/resumeVariants'
import type { ResumeVariantRow } from '@/lib/db/queries/resumeVariants'
import { logger } from '@/lib/logger'
import { getResumeProfile } from '@/lib/resume/service'
import { loadVariant, VariantError } from '@/lib/variants/service'
import { checkPortfolioProfile } from './checks'
import { diffDocuments, type SectionDiff } from './diff'
import { deleteFile, getFile, putFile, type RemoteFile } from './github'
import { contentHash, formatLastModified, nextVersion, serializeProfileJson, type JsonDoc } from './map'
import { loadPublishContext, parseRepo, repoVersion, type ConflictReason, type PublishContext } from './publish'
import { toVariantJsonResume } from './variant-map'
import { isVariantSlug, variantPageUrl, variantRepoPath } from './variant-paths'

/**
 * Publish one variant as variants/<slug>.json in the portfolio repo — the
 * same rules as profile.json (lib/portfolio/publish.ts): validated with the
 * portfolio's own checks before anything is sent, sha-checked against what
 * lee last wrote, optimistic PUT (409/422 → re-fetch and show the diff),
 * "chore(profile): sync …" commits. A variant holds no facts, so a hand
 * edit can't be taken back into lee: the user either overwrites it with
 * lee's version or leaves it alone.
 *
 * Unpublish deletes the file through the contents API (the UI confirms
 * first); the portfolio build then removes resume/<slug>.html.
 */

/** Same convention as profile.json's "chore(profile): sync from lee". */
export const variantCommitSubject = (slug: string): string => `chore(profile): sync variant ${slug} from lee`
export const variantDeleteSubject = (slug: string): string => `chore(profile): remove variant ${slug} (lee)`

export type VariantPublishOutcome =
  | { status: 'published'; version: string; commitUrl: string | null; pageUrl: string | null; publishedAt: string }
  | { status: 'up_to_date'; pageUrl: string | null }
  | { status: 'conflict'; reason: ConflictReason; repoSha: string | null; diff: SectionDiff[] }
  | { status: 'invalid'; errors: string[] }
  | { status: 'not_configured'; error: string }

export type VariantUnpublishOutcome =
  | { status: 'removed'; commitUrl: string | null }
  | { status: 'conflict'; error: string }
  | { status: 'not_configured'; error: string }

interface Target {
  ctx: PublishContext
  variant: ResumeVariantRow
  slug: string
  file: PublishContext['target']
}

async function resolveTarget(userId: string, variantId: string, now: Date): Promise<Target | { error: string }> {
  const ctx = await loadPublishContext(userId, now)
  if ('error' in ctx) return ctx
  const variant = await variantsQ.getById(userId, variantId)
  if (!variant) throw new VariantError('Variant not found.')
  const slug = variant.portfolioSlug
  if (!isVariantSlug(slug)) return { error: 'Give the variant a page address (slug) first.' }
  return { ctx, variant, slug, file: { ...ctx.target, path: variantRepoPath(ctx.target.path, slug) } }
}

function conflict(reason: ConflictReason, remote: RemoteFile, repo: JsonDoc | null, lee: JsonDoc): VariantPublishOutcome {
  const diff = diffDocuments(repo ?? {}, lee)
  logger.warn('variant_publish_conflict', { reason, sections: diff.length })
  return { status: 'conflict', reason, repoSha: remote.exists ? remote.sha : null, diff }
}

export function variantCommitMessage(slug: string, changed: readonly SectionDiff[], created: boolean): string {
  const summary = created
    ? `First sync of variants/${slug}.json from lee.`
    : changed.length > 0
      ? `Updated: ${changed.map((d) => d.section).join(', ')}.`
      : 'Refreshed metadata.'
  return `${variantCommitSubject(slug)}\n\n${summary}`
}

/** The file lee would write now for the variant's current version. */
export async function buildVariantDocument(
  userId: string,
  variant: ResumeVariantRow,
  slug: string,
  now: Date,
): Promise<{ doc: JsonDoc; version: number; pageUrl: string | null; canonical: string }> {
  const [{ profile }, loaded] = await Promise.all([getResumeProfile(userId), loadVariant(userId, variant.id)])
  const meta = { version: nextVersion(variant.portfolioLastVersion), lastModified: formatLastModified(now) }
  const doc = toVariantJsonResume(profile, loaded.recipe, slug, meta)
  return { doc, version: loaded.version, pageUrl: variantPageUrl(profile.portfolio.canonical, slug), canonical: profile.portfolio.canonical }
}

/** Preview for the Publish page: the JSON and the portfolio build's verdict. */
export async function previewVariant(userId: string, variantId: string, now = new Date()): Promise<{ json: string; errors: string[]; pageUrl: string | null }> {
  const variant = await variantsQ.getById(userId, variantId)
  if (!variant) throw new VariantError('Variant not found.')
  if (!isVariantSlug(variant.portfolioSlug)) return { json: '', errors: ['Give the variant a page address (slug) first.'], pageUrl: null }
  const { doc, pageUrl } = await buildVariantDocument(userId, variant, variant.portfolioSlug, now)
  return { json: serializeProfileJson(doc), errors: validate(doc, pageUrl), pageUrl }
}

function validate(doc: JsonDoc, pageUrl: string | null): string[] {
  if (!pageUrl) return ['Set your portfolio’s canonical URL (Résumé › Portfolio) first: the variant page address is built from it.']
  return checkPortfolioProfile(doc)
}

export async function publishVariant(
  userId: string,
  variantId: string,
  opts: { overwriteSha?: string | null; now?: Date } = {},
): Promise<VariantPublishOutcome> {
  const now = opts.now ?? new Date()
  const t = await resolveTarget(userId, variantId, now)
  if ('error' in t) return { status: 'not_configured', error: t.error }
  if (!t.variant.publishToPortfolio) return { status: 'not_configured', error: 'Turn on “Publish this variant to the portfolio” first.' }
  const { doc, version, pageUrl } = await buildVariantDocument(userId, t.variant, t.slug, now)
  const errors = validate(doc, pageUrl)
  if (errors.length > 0) return { status: 'invalid', errors }

  const remote = await getFile(t.file, t.ctx.token)
  const repo = parseRepo(remote)
  const hash = contentHash(doc)
  if (opts.overwriteSha !== undefined) {
    if ((remote.exists ? remote.sha : null) !== opts.overwriteSha) return conflict('changed_during_publish', remote, repo, doc)
  } else if (remote.exists && remote.sha !== t.variant.portfolioLastSha) {
    if (!repo) return conflict('unreadable', remote, null, doc)
    if (contentHash(repo) !== hash) return conflict('edited', remote, repo, doc)
  } else if (!remote.exists && t.variant.portfolioLastSha) {
    return conflict('deleted', remote, null, doc)
  }

  if (remote.exists && repo && contentHash(repo) === hash) {
    await variantsQ.recordPortfolioPublish(userId, t.variant.id, {
      portfolioLastSha: remote.sha,
      portfolioLastHash: hash,
      portfolioLastVersion: repoVersion(repo) ?? (doc.meta as JsonDoc).version as string,
      portfolioCommitUrl: t.variant.portfolioCommitUrl,
      portfolioPublishedAt: t.variant.portfolioPublishedAt ?? now,
    }, version)
    return { status: 'up_to_date', pageUrl }
  }

  const put = await putFile(t.file, t.ctx.token, {
    text: serializeProfileJson(doc),
    message: variantCommitMessage(t.slug, repo ? diffDocuments(repo, doc) : [], !remote.exists),
    sha: remote.exists ? remote.sha : null,
  })
  if (!put.ok) {
    const fresh = await getFile(t.file, t.ctx.token)
    return conflict('changed_during_publish', fresh, parseRepo(fresh), doc)
  }
  const published = (doc.meta as JsonDoc).version as string
  await variantsQ.recordPortfolioPublish(userId, t.variant.id, {
    portfolioLastSha: put.contentSha,
    portfolioLastHash: hash,
    portfolioLastVersion: published,
    portfolioCommitUrl: put.commitUrl,
    portfolioPublishedAt: now,
  }, version)
  logger.info('variant_published', { version: published, created: !remote.exists })
  return { status: 'published', version: published, commitUrl: put.commitUrl, pageUrl, publishedAt: now.toISOString() }
}

/** Delete variants/<slug>.json (already confirmed by the user) and turn the toggle off. */
export async function unpublishVariant(userId: string, variantId: string, opts: { now?: Date } = {}): Promise<VariantUnpublishOutcome> {
  const t = await resolveTarget(userId, variantId, opts.now ?? new Date())
  if ('error' in t) return { status: 'not_configured', error: t.error }
  const remote = await getFile(t.file, t.ctx.token)
  let commitUrl: string | null = null
  if (remote.exists) {
    const del = await deleteFile(t.file, t.ctx.token, { message: variantDeleteSubject(t.slug), sha: remote.sha })
    if (!del.ok) return { status: 'conflict', error: 'The file changed on GitHub while lee was removing it. Try again.' }
    commitUrl = del.commitUrl
  }
  await variantsQ.clearPortfolioPublish(userId, t.variant.id)
  logger.info('variant_unpublished', { existed: remote.exists })
  return { status: 'removed', commitUrl }
}
