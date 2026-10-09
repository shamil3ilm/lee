'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import { draftPost, POST_SOURCE_KINDS, publishPost } from '@/lib/integrations/linkedin/composer'
import { importConnections } from '@/lib/integrations/linkedin/connections'
import { linkedinExportSchema, type LinkedInExport } from '@/lib/integrations/linkedin/export/parse'
import { suggestProfileRewrites } from '@/lib/integrations/linkedin/optimizer-service'
import { buildImportItems, intentionName, LINKEDIN_SKILL_GROUP } from '@/lib/integrations/linkedin/review'
import { applyLinkedInSelection } from '@/lib/integrations/linkedin/review-apply'
import * as batchesQ from '@/lib/db/queries/importBatches'
import { readChanges, type ImportChanges } from '@/lib/import/changes'
import type { ReadinessIntention } from '@/lib/import/intentions'
import { suggestionSnippets, type ImportApplyResult } from '@/lib/import/result'
import { cleanSelection, pickedItems } from '@/lib/import/selection'
import { commitImport, portfolioProfileUrl } from '@/lib/import/service'
import type { ImportItem, ReviewSelection } from '@/lib/import/types'
import { profileEditableInLee } from '@/lib/profile/edit-mode'
import { logger } from '@/lib/logger'
import { getResumeProfile, ResumeValidationError, saveResumeProfile } from '@/lib/resume/service'
import { getAIProviderForUser } from '@/lib/ai'
import type { AIProvider } from '@/lib/ai/types'
import * as capturesQ from '@/lib/db/queries/postCaptures'
import { unavailableAi } from '@/lib/discovery/manual-import/no-ai'
import { runDiscoveryForSource } from '@/lib/discovery/service'
import { ensureLinkedInPostSource } from '@/lib/linkedin-posts/source'

/**
 * Settings › LinkedIn: the export import (review → confirm), connections,
 * optimizer suggestions and the post composer. Every action is scoped to
 * the signed-in user; Post runs only from the composer's button.
 */

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

function fail(what: string, err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof ResumeValidationError) return { ok: false, error: err.message }
  logger.error(`${what}_failed`, { err: err instanceof Error ? err.name : 'unknown' })
  return { ok: false, error: fallback }
}

const profilePartSchema = linkedinExportSchema.omit({ connections: true })

function intentionsFor(data: LinkedInExport, items: readonly ImportItem[], sel: ReviewSelection): ReadinessIntention[] {
  const mine = new Set(sel.mine)
  return pickedItems(items, sel)
    .filter((i) => i.hasReadiness)
    .flatMap((i) => {
      const n = intentionName(data, i.key)
      return n ? [{ ...n, mine: mine.has(i.key) }] : []
    })
}

/**
 * Confirm the review. Public facts (positions, skills, projects, …) are
 * added to the master profile only while profile editing in lee is on;
 * otherwise they come back as portfolio suggestions and the chosen
 * readiness is kept as intentions. The headline / About / positions for the
 * optimizer (lee-only) are saved either way. Always records an import
 * batch: connections imported next are tagged with it, so Undo removes them.
 */
export async function applyLinkedInImportAction(data: unknown, selection: unknown): Promise<ImportApplyResult> {
  const userId = await requireUserId()
  const parsed = profilePartSchema.safeParse(data)
  if (!parsed.success) return { ok: false, error: 'The export could not be read.' }
  try {
    const exportData: LinkedInExport = { ...parsed.data, connections: [] }
    const { profile } = await getResumeProfile(userId)
    const items = buildImportItems(profile, exportData)
    const sel = cleanSelection(items, selection)
    if (!sel) return { ok: false, error: 'The export could not be read.' }
    const editable = profileEditableInLee()
    const importedAt = new Date()
    const changes: ImportChanges = {}
    let resume = null
    let counts: Record<string, number> = {}
    if (editable && sel.picked.length > 0) {
      const r = applyLinkedInSelection(profile, exportData, items, sel, { source: 'linkedin', importedAt: importedAt.toISOString() })
      resume = r.profile
      counts = r.counts
      if (r.updated.length > 0) changes.resumeUpdated = r.updated
    } else if (!editable) {
      counts.suggested = pickedItems(items, sel).filter((i) => i.status !== 'duplicate').length
    }
    if (parsed.data.profile || parsed.data.positions.length > 0) {
      const prior = await linkedinQ.getImport(userId)
      changes.linkedinImportBefore = prior ? { headline: prior.headline, summary: prior.summary, positions: prior.positions } : null
      await linkedinQ.saveImport(userId, {
        headline: parsed.data.profile?.headline ?? '',
        summary: parsed.data.profile?.summary ?? '',
        positions: parsed.data.positions.map((p) => ({ company: p.company, title: p.title, startDate: p.startDate, endDate: p.endDate })),
      })
    }
    const intentions = editable ? [] : intentionsFor(exportData, items, sel)
    const batch = await commitImport(userId, { source: 'linkedin', editable, importedAt, patch: {}, resume, intentions, changes, counts })
    revalidatePath('/settings/linkedin')
    revalidatePath('/settings/resume')
    const added = editable ? Object.entries(counts).filter(([k]) => !k.endsWith('Updated')).reduce((a, [, n]) => a + n, 0) : 0
    return {
      ok: true,
      mode: editable ? 'saved' : 'suggested',
      batchId: batch.id,
      saved: added,
      snippets: editable ? [] : suggestionSnippets(items, sel, LINKEDIN_SKILL_GROUP),
      profileUrl: editable ? null : await portfolioProfileUrl(userId),
    }
  } catch (err) {
    return fail('linkedin_import', err, 'Could not apply the import.')
  }
}

const connectionsChunkSchema = linkedinExportSchema.shape.connections.max(2000)
const batchIdSchema = z.string().uuid().nullable()

/** One chunk of Connections.csv (the client sends ≤ 2,000 rows per call), tagged with the import batch. */
export async function importConnectionsChunkAction(rows: unknown, includeEmails: boolean, batchId: unknown = null): Promise<ActionResult<{ saved: number }>> {
  const userId = await requireUserId()
  const parsed = connectionsChunkSchema.safeParse(rows)
  const batch = batchIdSchema.safeParse(batchId)
  if (!parsed.success || !batch.success || typeof includeEmails !== 'boolean') return { ok: false, error: 'The connections could not be read.' }
  try {
    let tag: string | null = null
    if (batch.data) {
      const row = await batchesQ.getById(userId, batch.data)
      if (!row || row.source !== 'linkedin' || row.undoneAt) return { ok: false, error: 'The import could not be found.' }
      tag = row.id
      const changes = readChanges(row.changes)
      if (!changes.connections) await batchesQ.update(userId, row.id, { changes: { ...changes, connections: true } })
    }
    const saved = await importConnections(userId, parsed.data, includeEmails, tag)
    revalidatePath('/settings/linkedin')
    return { ok: true, saved }
  } catch (err) {
    return fail('linkedin_connections_import', err, 'Could not save the connections.')
  }
}

export interface ConnectionView {
  id: string
  name: string
  company: string
  position: string
  connectedOn: string | null
}

export async function searchConnectionsAction(q: string): Promise<ActionResult<{ rows: ConnectionView[] }>> {
  const userId = await requireUserId()
  const query = typeof q === 'string' ? q.slice(0, 100) : ''
  const rows = await linkedinQ.searchConnections(userId, query, 50)
  return { ok: true, rows: rows.map((r) => ({ id: r.id, name: r.name, company: r.company, position: r.position, connectedOn: r.connectedOn })) }
}

export async function deleteAllConnectionsAction(): Promise<ActionResult<{ deleted: number }>> {
  const userId = await requireUserId()
  try {
    const deleted = await linkedinQ.deleteAllConnections(userId)
    logger.info('linkedin_connections_deleted', { userId, deleted })
    revalidatePath('/settings/linkedin')
    return { ok: true, deleted }
  } catch (err) {
    return fail('linkedin_connections_delete', err, 'Could not delete the connections.')
  }
}

export async function deleteLinkedInImportAction(): Promise<ActionResult> {
  const userId = await requireUserId()
  await linkedinQ.deleteImport(userId)
  revalidatePath('/settings/linkedin')
  return { ok: true }
}

export async function suggestProfileAction(): Promise<ActionResult<{ headlines: string[]; about: string | null; dropped: number }>> {
  const userId = await requireUserId()
  try {
    const r = await suggestProfileRewrites(userId)
    return r.ok ? { ok: true, headlines: r.headlines, about: r.about, dropped: r.dropped } : r
  } catch (err) {
    return fail('linkedin_profile_suggest', err, 'Could not draft suggestions.')
  }
}

export async function draftPostAction(sourceId: string): Promise<ActionResult<{ text: string; aiUsed: boolean }>> {
  const userId = await requireUserId()
  if (typeof sourceId !== 'string' || sourceId.length > 80) return { ok: false, error: 'Pick a source.' }
  try {
    const r = await draftPost(userId, sourceId)
    return r.ok ? { ok: true, text: r.text, aiUsed: r.aiUsed } : r
  } catch (err) {
    return fail('linkedin_draft', err, 'Could not draft the post.')
  }
}

const postSchema = z.object({
  text: z.string().max(3000),
  sourceId: z.string().max(80).nullable(),
  sourceKind: z.enum(POST_SOURCE_KINDS),
  confirmed: z.literal(true),
})

/** The explicit Post click. `confirmed` must be true: the preview step was shown. */
export async function publishPostAction(input: unknown): Promise<ActionResult<{ url: string | null }>> {
  const userId = await requireUserId()
  const parsed = postSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Preview the post and click Post to publish it.' }
  try {
    const r = await publishPost(userId, parsed.data)
    if (r.ok) revalidatePath('/settings/linkedin')
    return r.ok ? { ok: true, url: r.url } : r
  } catch (err) {
    return fail('linkedin_post', err, 'Could not post to LinkedIn. Nothing was published.')
  }
}

// ---------------------------------------------------------------------------
// Hiring posts (lib/linkedin-posts): read the user's own LinkedIn
// notification emails in Gmail, and the "Send to lee" bookmarklet key.
// ---------------------------------------------------------------------------

export async function setHiringPostsAction(enabled: unknown): Promise<ActionResult> {
  if (typeof enabled !== 'boolean') return { ok: false, error: 'Choose on or off.' }
  const userId = await requireUserId()
  try {
    await ensureLinkedInPostSource(userId, { enable: enabled })
    revalidatePath('/settings/linkedin')
    revalidatePath('/settings/sources')
    return { ok: true }
  } catch (err) {
    return fail('linkedin_hiring_posts_toggle', err, 'Could not change the setting.')
  }
}

export async function checkHiringPostsNowAction(): Promise<ActionResult<{ found: number; added: number; unreadable: number }>> {
  const userId = await requireUserId()
  try {
    const source = await ensureLinkedInPostSource(userId)
    if (!source.enabled) return { ok: false, error: 'Turn on reading LinkedIn emails first.' }
    let ai: AIProvider
    try {
      ai = await getAIProviderForUser(userId)
    } catch {
      ai = unavailableAi('No AI key: scoring runs on the next discovery run.')
    }
    const r = await runDiscoveryForSource({ userId, sourceId: source.id, ai, deadline: Date.now() + 40_000 })
    revalidatePath('/settings/linkedin')
    revalidatePath('/discoveries')
    if (r.status === 'failed') return { ok: false, error: r.error ?? 'Could not read your LinkedIn emails.' }
    return { ok: true, found: r.stats?.fetched ?? 0, added: r.newJobDiscoveries, unreadable: r.stats?.parseFailures ?? 0 }
  } catch (err) {
    return fail('linkedin_hiring_posts_check', err, 'Could not read your LinkedIn emails.')
  }
}

export async function rotateCaptureKeyAction(): Promise<ActionResult> {
  const userId = await requireUserId()
  try {
    await capturesQ.rotateKey(userId)
    revalidatePath('/settings/linkedin')
    return { ok: true }
  } catch (err) {
    return fail('capture_key_rotate', err, 'Could not make a new bookmarklet.')
  }
}
