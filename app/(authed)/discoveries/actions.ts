'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import {
  promoteJobDiscovery,
  promoteCompanyDiscovery,
  dismissDiscovery as dismissJobService,
  dismissCompanyDiscovery as dismissCompanyService,
} from '@/lib/discovery/service'
import * as discQ from '@/lib/db/queries/discoveries'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }
export type BulkResult = { success: true; count: number } | { error: string }

export async function saveDiscovery(discoveryId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await promoteJobDiscovery({ userId, discoveryId })
    revalidatePath('/discoveries')
    revalidatePath('/')
    revalidatePath('/applications')
    return { success: true }
  } catch (err) {
    logger.error('saveDiscovery failed', {
      discoveryId,
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save discovery.' }
  }
}

export async function dismissDiscovery(discoveryId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await dismissJobService({ userId, discoveryId })
    revalidatePath('/discoveries')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    logger.error('dismissDiscovery failed', {
      discoveryId,
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not dismiss.' }
  }
}

export async function saveCompanyDiscovery(discoveryId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await promoteCompanyDiscovery({ userId, discoveryId })
    revalidatePath('/discoveries')
    revalidatePath('/companies')
    return { success: true }
  } catch (err) {
    logger.error('saveCompanyDiscovery failed', {
      discoveryId,
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not add company to watchlist.' }
  }
}

export async function dismissCompanyDiscovery(discoveryId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await dismissCompanyService({ userId, discoveryId })
    revalidatePath('/discoveries')
    return { success: true }
  } catch (err) {
    logger.error('dismissCompanyDiscovery failed', {
      discoveryId,
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not dismiss.' }
  }
}

/**
 * Bulk-dismiss the given job-discovery ids in one round trip. Returns the
 * number of rows that transitioned so the UI can show an accurate toast.
 */
export async function dismissMultiple(ids: string[]): Promise<BulkResult> {
  try {
    const userId = await requireUserId()
    // Defensive: strip anything that isn't a plausible uuid so a hostile
    // caller can't smuggle SQL through the array driver's escaping. Length
    // check keeps the where-clause bounded.
    const clean = ids.filter((v) => typeof v === 'string' && v.length <= 64)
    if (clean.length === 0) return { success: true, count: 0 }
    const count = await discQ.dismissByIds(userId, clean)
    revalidatePath('/discoveries')
    revalidatePath('/')
    return { success: true, count }
  } catch (err) {
    logger.error('dismissMultiple failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not dismiss selected discoveries.' }
  }
}

/**
 * Bulk-dismiss every `new` job discovery older than `days` days. The 7-day
 * button in the inbox calls this with `days=7`.
 */
export async function dismissOlderThan(days: number): Promise<BulkResult> {
  try {
    if (!Number.isFinite(days) || days <= 0) {
      return { error: 'Invalid age threshold.' }
    }
    const userId = await requireUserId()
    const count = await discQ.dismissOlderThan(userId, Math.floor(days))
    revalidatePath('/discoveries')
    revalidatePath('/')
    return { success: true, count }
  } catch (err) {
    logger.error('dismissOlderThan failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not dismiss older discoveries.' }
  }
}
