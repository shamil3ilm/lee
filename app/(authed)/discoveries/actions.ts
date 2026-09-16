'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import {
  promoteJobDiscovery,
  promoteCompanyDiscovery,
  dismissDiscovery as dismissJobService,
  dismissCompanyDiscovery as dismissCompanyService,
} from '@/lib/discovery/service'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

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
