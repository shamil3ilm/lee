'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { saveProfile } from '@/lib/profile/service'
import { logger } from '@/lib/logger'

export type LabsActionResult = { success: true } | { error: string }

/** Settings › Labs: show or hide the side projects in the sidebar. */
export async function setLabsAction(enabled: boolean): Promise<LabsActionResult> {
  if (typeof enabled !== 'boolean') return { error: 'Choose on or off.' }
  try {
    const userId = await requireUserId()
    await saveProfile(userId, { labsEnabled: enabled })
    // The sidebar lives in the authed layout: refresh every page under it.
    revalidatePath('/', 'layout')
    return { success: true }
  } catch (err) {
    logger.error('setLabs failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save the Labs setting.' }
  }
}
