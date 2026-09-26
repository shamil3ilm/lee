'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as sourcesQ from '@/lib/db/queries/sources'
import { getAdapter, listAdapterKinds } from '@/lib/discovery/adapters'
import { BOARD_SLUG_RE, sourceKindNeeds } from '@/lib/discovery/source-kinds'
import { logger } from '@/lib/logger'
import { queueFirstPoll } from '@/lib/queue/first-poll'

export type ActionResult = { success: true } | { error: string }

const idSchema = z.string().uuid()


const addSchema = z.object({
  kind: z.string().min(1),
  name: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  url: z.string().trim().url().max(1000).optional(),
})

/**
 * Build the adapter-specific config object from the form fields. Each kind
 * enforces its own required inputs so we don't create sources the adapter
 * can't handle.
 */
function buildConfig(kind: string, company?: string, url?: string):
  { config: Record<string, unknown>; summary: string } {
  if (sourceKindNeeds(kind) === 'company') {
    if (!company) throw new Error('company (slug) is required for this source kind')
    return { config: { company }, summary: `company: ${company}` }
  }
  if (sourceKindNeeds(kind) === 'url') {
    if (!url) throw new Error('url is required for this source kind')
    return { config: { url }, summary: url }
  }
  return { config: {}, summary: 'all' }
}

export async function addSource(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const parsed = addSchema.safeParse({
      kind: formData.get('kind'),
      name: formData.get('name') || undefined,
      company: formData.get('company') || undefined,
      url: formData.get('url') || undefined,
    })
    if (!parsed.success) return { error: 'Please fill required fields.' }
    const { kind, name, company, url } = parsed.data
    if (!getAdapter(kind)) {
      return { error: `Unknown source kind: ${kind}` }
    }
    if (!listAdapterKinds().includes(kind)) {
      return { error: `Unsupported source kind: ${kind}` }
    }
    const { config, summary } = buildConfig(kind, company, url)
    const finalName = name?.trim() || `${kind} — ${summary}`
    const created = await sourcesQ.create(userId, {
      name: finalName,
      kind,
      config,
      enabled: true,
    })
    // First search now (right after the response) instead of at the next
    // daily scheduler run. Best effort: the source is saved either way.
    await queueFirstPoll(userId, created.id).catch((err: unknown) =>
      logger.warn('addSource first poll not queued', {
        err: err instanceof Error ? err.message : String(err),
      }),
    )
    revalidatePath('/settings/sources')
    revalidatePath('/discoveries')
    return { success: true }
  } catch (err) {
    logger.error('addSource failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    const message = err instanceof Error ? err.message : 'Could not add source.'
    // Adapter validation messages are safe to surface (they describe what's
    // missing); other errors are masked.
    if (message.includes('required')) return { error: message }
    return { error: 'Could not add source.' }
  }
}

export async function toggleSourceEnabled(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(id).success) return { error: 'Source not found.' }
    const updated = await sourcesQ.update(userId, id, { enabled })
    if (!updated) return { error: 'Source not found.' }
    if (enabled) {
      await queueFirstPoll(userId, id).catch((err: unknown) =>
        logger.warn('toggleSourceEnabled first poll not queued', {
          err: err instanceof Error ? err.message : String(err),
        }),
      )
    }
    revalidatePath('/settings/sources')
    return { success: true }
  } catch (err) {
    logger.error('toggleSourceEnabled failed', {
      id,
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update source.' }
  }
}

export async function removeSource(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(id).success) return { error: 'Source not found.' }
    const ok = await sourcesQ.remove(userId, id)
    if (!ok) return { error: 'Source not found.' }
    revalidatePath('/settings/sources')
    revalidatePath('/discoveries')
    return { success: true }
  } catch (err) {
    logger.error('removeSource failed', {
      id,
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not remove source.' }
  }
}


const updateSchema = z.object({
  name: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  url: z.string().trim().max(1000).optional(),
  enabled: z.enum(['true', 'false']).optional(),
})

function summaryFor(needs: 'company' | 'url' | 'none', value: string): string {
  if (needs === 'company') return `company: ${value}`
  if (needs === 'url') return value
  return 'all'
}

/**
 * Edit a source: display name, its one kind-specific setting (board slug for
 * ATS boards, feed URL for RSS / JSON-LD) and enabled. The kind itself is
 * fixed — discoveries are deduped per (source, item id), so switching kind
 * would mix two feeds under one source; add a new source instead. Other
 * config keys (e.g. the linked companyId) are preserved. Changing the
 * slug/URL clears the error history so a fixed source gets a clean slate.
 */
export async function updateSource(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(id).success) return { error: 'Source not found.' }
    const parsed = updateSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: 'Please check the source details.' }
    const existing = await sourcesQ.getById(userId, id)
    if (!existing) return { error: 'Source not found.' }

    const needs = sourceKindNeeds(existing.kind)
    const config = { ...((existing.config ?? {}) as Record<string, unknown>) }
    let value = ''
    if (needs === 'company') {
      value = parsed.data.company ?? ''
      if (!value) return { error: 'Board slug is required for this source.' }
      if (!BOARD_SLUG_RE.test(value)) {
        return { error: 'Board slug may only contain letters, numbers, dots, dashes and underscores.' }
      }
      config.company = value
    } else if (needs === 'url') {
      value = parsed.data.url ?? ''
      if (!z.string().url().safeParse(value).success || !/^https?:\/\//i.test(value)) {
        return { error: 'Enter a valid feed URL.' }
      }
      config.url = value
    }
    const before = (existing.config ?? {}) as Record<string, unknown>
    const configChanged =
      (needs === 'company' && before.company !== config.company) ||
      (needs === 'url' && before.url !== config.url)

    const updated = await sourcesQ.update(userId, id, {
      name: parsed.data.name || `${existing.kind} — ${summaryFor(needs, value)}`,
      config,
      ...(parsed.data.enabled ? { enabled: parsed.data.enabled === 'true' } : {}),
      ...(configChanged ? { lastError: null, errorCount: 0 } : {}),
    })
    if (!updated) return { error: 'Source not found.' }
    revalidatePath('/settings/sources')
    revalidatePath('/discoveries')
    return { success: true }
  } catch (err) {
    logger.error('updateSource failed', {
      id,
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update source.' }
  }
}
