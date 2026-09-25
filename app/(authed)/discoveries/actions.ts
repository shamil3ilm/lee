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
import * as compDiscQ from '@/lib/db/queries/companyDiscoveries'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { logger } from '@/lib/logger'

export type ActionResult =
  | { success: true }
  | { error: string }
  | { conflict: string; currentStatus: string; message: string }
export type BulkResult = { success: true; count: number } | { error: string }

/**
 * Promote a job discovery to an application. v9 guard: refuse if the
 * discovery is no longer `new` (dismissed in another tab; already promoted).
 * The client toasts the returned message and refreshes the inbox.
 */
export async function saveDiscovery(discoveryId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    // v9 — re-check status at execute time. Between the user seeing the
    // button and the click landing here, another tab or the discovery cron
    // may have advanced the row.
    const current = await discQ.getById(userId, discoveryId)
    if (!current) return { error: 'Discovery not found.' }
    if (current.status !== 'new') {
      return {
        conflict: 'discovery_not_new',
        currentStatus: current.status,
        message: `This discovery was ${current.status} since you last viewed it. Refreshing.`,
      }
    }
    await promoteJobDiscovery({ userId, discoveryId })
    // v10.1 — implicit positive signal on the underlying scoring call so
    // analytics can correlate discovery scores → outcomes.
    if (current.scoredByCallId) {
      await aiCallLogsQ.updateAction(userId, current.scoredByCallId, 'used')
    }
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
    // Pre-read so we can attribute the implicit signal — the row is mutated
    // by dismissJobService below.
    const before = await discQ.getById(userId, discoveryId)
    await dismissJobService({ userId, discoveryId })
    // v10.1 — implicit negative signal on the scoring call. Safe when the
    // discovery has no scoredByCallId (no-op update by id + user).
    if (before?.scoredByCallId) {
      await aiCallLogsQ.updateAction(userId, before.scoredByCallId, 'dismissed')
    }
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
    // v9 — same drift guard as saveDiscovery, applied to company discoveries.
    const current = await compDiscQ.getById(userId, discoveryId)
    if (!current) return { error: 'Company discovery not found.' }
    if (current.status !== 'new') {
      return {
        conflict: 'discovery_not_new',
        currentStatus: current.status,
        message: `This company discovery was ${current.status} since you last viewed it. Refreshing.`,
      }
    }
    await promoteCompanyDiscovery({ userId, discoveryId })
    if (current.scoredByCallId) {
      await aiCallLogsQ.updateAction(userId, current.scoredByCallId, 'used')
    }
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
    const before = await compDiscQ.getById(userId, discoveryId)
    await dismissCompanyService({ userId, discoveryId })
    if (before?.scoredByCallId) {
      await aiCallLogsQ.updateAction(userId, before.scoredByCallId, 'dismissed')
    }
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
