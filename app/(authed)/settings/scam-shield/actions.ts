'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { saveProfile } from '@/lib/profile/service'
import * as allowQ from '@/lib/db/queries/scamAllowList'
import { logger } from '@/lib/logger'

export type ActionResult = { success: true } | { error: string }

/** v17 §1 — opt in/out of Scam Shield network checks (RDAP + DNS-over-HTTPS). */
export async function toggleScamNetChecksAction(enabled: boolean): Promise<ActionResult> {
  if (typeof enabled !== 'boolean') return { error: 'Invalid value.' }
  try {
    const userId = await requireUserId()
    await saveProfile(userId, { scamNetChecks: enabled })
    revalidatePath('/settings/scam-shield')
    return { success: true }
  } catch (err) {
    logger.error('toggleScamNetChecks failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not update Scam Shield settings.' }
  }
}

const idSchema = z.string().uuid()

/**
 * Forget one allow-list entry. Items it released stay released until their
 * next re-assessment (a rules-version bump or a job edit).
 */
export async function removeAllowListEntryAction(id: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { error: 'Invalid entry.' }
  try {
    const userId = await requireUserId()
    const removed = await allowQ.remove(userId, parsed.data)
    if (!removed) return { error: 'Entry not found.' }
    revalidatePath('/settings/scam-shield')
    return { success: true }
  } catch (err) {
    logger.error('removeAllowListEntry failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not remove the entry.' }
  }
}
