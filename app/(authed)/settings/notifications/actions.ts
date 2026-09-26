'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { saveProfile } from '@/lib/profile/service'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

/**
 * Toggle the weekly digest on/off. This gates the cron send even on Mondays
 * — see the `digest:user` job (lib/queue/handlers.ts), which checks the flag
 * before dispatch.
 */
export async function toggleDigestAction(enabled: boolean): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await saveProfile(userId, { weeklyDigestEnabled: enabled })
    revalidatePath('/settings/notifications')
    return { success: true }
  } catch (err) {
    logger.error('toggleDigest failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update notifications.' }
  }
}

/**
 * Toggle the per-discovery-cycle email notification. Independent of the
 * weekly digest — see the `discovery-email:user` job (lib/queue/handlers.ts),
 * which calls sendDiscoveryEmailIfEnabled after the user's source polls.
 */
export async function toggleDiscoveryEmailAction(
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await saveProfile(userId, { notifyDiscoveryEmail: enabled })
    revalidatePath('/settings/notifications')
    return { success: true }
  } catch (err) {
    logger.error('toggleDiscoveryEmail failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update discovery email setting.' }
  }
}

/** Toggle browser notifications for high-match discoveries. */
export async function toggleDiscoveryBrowserAction(
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await saveProfile(userId, { notifyDiscoveryBrowser: enabled })
    revalidatePath('/settings/notifications')
    return { success: true }
  } catch (err) {
    logger.error('toggleDiscoveryBrowser failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update browser notification setting.' }
  }
}

/**
 * Set the minimum match score that triggers a discovery notification. Clamped
 * server-side to [0, 100] — even though the UI uses a bounded slider, we
 * never trust the client value.
 */
export async function setDiscoveryMinScoreAction(
  score: number,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!Number.isFinite(score)) {
      return { error: 'Score must be a number.' }
    }
    const clamped = Math.max(0, Math.min(100, Math.round(score)))
    await saveProfile(userId, { notifyDiscoveryMinScore: clamped })
    revalidatePath('/settings/notifications')
    return { success: true }
  } catch (err) {
    logger.error('setDiscoveryMinScore failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update minimum score.' }
  }
}
