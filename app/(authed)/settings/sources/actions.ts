'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as sourcesQ from '@/lib/db/queries/sources'
import { getAdapter, listAdapterKinds } from '@/lib/discovery/adapters'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

const KINDS_WITH_COMPANY = new Set(['greenhouse', 'lever', 'ashby', 'workable'])
const KINDS_WITH_URL = new Set(['rss', 'jsonld'])

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
  if (KINDS_WITH_COMPANY.has(kind)) {
    if (!company) throw new Error('company (slug) is required for this source kind')
    return { config: { company }, summary: `company: ${company}` }
  }
  if (KINDS_WITH_URL.has(kind)) {
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
    await sourcesQ.create(userId, {
      name: finalName,
      kind,
      config,
      enabled: true,
    })
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
    const updated = await sourcesQ.update(userId, id, { enabled })
    if (!updated) return { error: 'Source not found.' }
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
    const ok = await sourcesQ.remove(userId, id)
    if (!ok) return { error: 'Source not found.' }
    revalidatePath('/settings/sources')
    return { success: true }
  } catch (err) {
    logger.error('removeSource failed', {
      id,
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not remove source.' }
  }
}
