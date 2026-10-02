'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { isOwner } from '@/lib/auth/owner'
import * as retentionQ from '@/lib/db/queries/retentionSettings'
import { runRetentionForUser } from '@/lib/db/retention/run'
import { totalChanged } from '@/lib/db/retention/steps'
import { retentionPolicySchema } from '@/lib/db/retention/windows'
import { logger } from '@/lib/logger'

export type StorageActionResult = { success: true; message: string } | { error: string }

const NOT_OWNER = 'Only the owner of this lee deployment can do that.'

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * "Clean up now": run the nightly cleanup immediately for the signed-in
 * owner (their rows with their windows, plus the global steps). Only counts
 * reach the client; the page then shows the per-step breakdown.
 */
export async function cleanUpNowAction(): Promise<StorageActionResult> {
  try {
    const userId = await requireUserId()
    if (!(await isOwner(userId))) return { error: NOT_OWNER }
    const result = await runRetentionForUser(userId)
    logger.info('storage_cleanup_manual', { ...result })
    revalidatePath('/settings/storage')
    const total = totalChanged(result)
    const summary = total === 0 ? 'Nothing to clean up.' : `Cleaned up ${total.toLocaleString('en-US')} rows.`
    const more = result.complete ? '' : ' Time ran out; the rest is cleaned tonight.'
    return { success: true, message: `${summary}${more}` }
  } catch (err) {
    logger.error('storage_cleanup_manual_failed', { err: errMessage(err) })
    return { error: 'Could not clean up right now.' }
  }
}

/** Save the editable retention windows (all of them, validated). */
export async function saveRetentionWindowsAction(input: Record<string, unknown>): Promise<StorageActionResult> {
  const parsed = retentionPolicySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid retention windows.' }
  try {
    const userId = await requireUserId()
    if (!(await isOwner(userId))) return { error: NOT_OWNER }
    await retentionQ.savePolicy(userId, parsed.data)
    revalidatePath('/settings/storage')
    return { success: true, message: 'Retention windows saved. They apply from the next cleanup.' }
  } catch (err) {
    logger.error('saveRetentionWindows failed', { err: errMessage(err) })
    return { error: 'Could not save the retention windows.' }
  }
}
