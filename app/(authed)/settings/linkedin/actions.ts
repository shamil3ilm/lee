'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import { draftPost, POST_SOURCE_KINDS, publishPost } from '@/lib/integrations/linkedin/composer'
import { importConnections } from '@/lib/integrations/linkedin/connections'
import { linkedinExportSchema } from '@/lib/integrations/linkedin/export/parse'
import { suggestProfileRewrites } from '@/lib/integrations/linkedin/optimizer-service'
import { applyImportSelection } from '@/lib/integrations/linkedin/review'
import { logger } from '@/lib/logger'
import { getResumeProfile, ResumeValidationError, saveResumeProfile } from '@/lib/resume/service'

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
const selectionSchema = z.object({
  keys: z.array(z.string().max(40)).max(500),
  own: z.array(z.string().max(40)).max(500),
})

/** Confirm the review: add the ticked new items to the master profile and keep headline / About / positions for the optimizer. */
export async function applyLinkedInImportAction(
  data: unknown,
  selection: unknown,
): Promise<ActionResult<{ added: number }>> {
  const userId = await requireUserId()
  const parsed = profilePartSchema.safeParse(data)
  const sel = selectionSchema.safeParse(selection)
  if (!parsed.success || !sel.success) return { ok: false, error: 'The export could not be read.' }
  try {
    const exportData = { ...parsed.data, connections: [] }
    if (sel.data.keys.length > 0) {
      const { profile } = await getResumeProfile(userId)
      await saveResumeProfile(userId, applyImportSelection(profile, exportData, sel.data))
    }
    if (parsed.data.profile || parsed.data.positions.length > 0) {
      await linkedinQ.saveImport(userId, {
        headline: parsed.data.profile?.headline ?? '',
        summary: parsed.data.profile?.summary ?? '',
        positions: parsed.data.positions.map((p) => ({ company: p.company, title: p.title, startDate: p.startDate, endDate: p.endDate })),
      })
    }
    logger.info('linkedin_import_applied', { userId, added: sel.data.keys.length })
    revalidatePath('/settings/linkedin')
    revalidatePath('/settings/resume')
    return { ok: true, added: sel.data.keys.length }
  } catch (err) {
    return fail('linkedin_import', err, 'Could not apply the import.')
  }
}

const connectionsChunkSchema = linkedinExportSchema.shape.connections.max(2000)

/** One chunk of Connections.csv (the client sends ≤ 2,000 rows per call). */
export async function importConnectionsChunkAction(rows: unknown, includeEmails: boolean): Promise<ActionResult<{ saved: number }>> {
  const userId = await requireUserId()
  const parsed = connectionsChunkSchema.safeParse(rows)
  if (!parsed.success || typeof includeEmails !== 'boolean') return { ok: false, error: 'The connections could not be read.' }
  try {
    const saved = await importConnections(userId, parsed.data, includeEmails)
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
