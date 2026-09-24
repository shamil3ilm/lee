'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { saveProfile } from '@/lib/profile/service'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

/**
 * Toggle the weekly digest on/off. This gates the cron send even on Mondays
 * — see cron/sync-all where the flag is consulted before dispatch.
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
