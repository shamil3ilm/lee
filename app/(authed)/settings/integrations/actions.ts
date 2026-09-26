'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as profileQ from '@/lib/db/queries/profile'
import { migrateAssetsToDrive, type MigrateResult } from '@/lib/drive/migrate'
import { logger } from '@/lib/logger'

/**
 * Integrations settings server actions.
 *
 * Reconnecting Google is a client-side redirect through Auth.js (see the
 * integrations panel); "Connect Google Drive" is lib/drive/actions.ts.
 * Manual Gmail sync is `POST /api/gmail/sync`.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

/** Settings › Integrations toggle: store new files in Google Drive. */
export async function setDriveStorageEnabledAction(enabled: boolean): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = z.boolean().safeParse(enabled)
  if (!parsed.success) return { ok: false, error: 'Invalid setting.' }
  try {
    await profileQ.upsert(userId, { driveStorageEnabled: parsed.data })
    revalidatePath('/settings/integrations')
    return { ok: true }
  } catch (err) {
    logger.error('set_drive_storage_failed', { err: err instanceof Error ? err.message : String(err) })
    return { ok: false, error: 'Could not save the setting.' }
  }
}

/**
 * "Move existing files to Drive": one bounded, resumable batch. The client
 * calls it again while files remain and progress is being made.
 */
export async function moveFilesToDriveAction(): Promise<MigrateResult | { error: { code: 'failed'; message: string } }> {
  const userId = await requireUserId()
  try {
    const result = await migrateAssetsToDrive(userId, { budgetMs: 20_000, maxFiles: 25 })
    if (result.migrated > 0) revalidatePath('/settings/integrations')
    return result
  } catch (err) {
    logger.error('drive_migrate_failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: { code: 'failed', message: 'Could not move files right now. Please try again.' } }
  }
}
