import * as assetsQ from '@/lib/db/queries/documentAssets'
import { logger } from '@/lib/logger'
import { getDriveAssetStore } from '@/lib/storage/asset-store'
import type { DriveAssetStore } from '@/lib/storage/drive-asset-store'
import { driveSize, type DriveFile } from './client'
import { getDriveConnection } from './connection'
import { DriveError, toDriveError } from './errors'

/**
 * Move a user's existing Postgres-held document assets into their Drive.
 *
 * Resumable and idempotent, so it can run from a Settings button now and be
 * enqueued as a background job later (A3): each call does one bounded batch
 * and reports what is left.
 *
 * Per asset: find-or-upload (tagged with appProperties.employAssetId, so a
 * crash after the upload is picked up on the next run instead of uploading
 * twice) → verify Drive's sha256 against the stored hash → in ONE statement
 * record the Drive id and clear the bytea, guarded on the bytes still being
 * there with that hash. The bytea is never cleared before a verified Drive
 * copy exists, so the only copy is never lost.
 */

export interface MigrateOptions {
  /** Stop starting new files after this long (default 20 s). */
  budgetMs?: number
  /** Max files per call (default 25). */
  maxFiles?: number
  store?: DriveAssetStore
  now?: () => number
}

export interface MigrateResult {
  migrated: number
  failed: number
  remaining: number
  /** Set when the whole run stopped on a Drive-level problem. */
  error?: { code: DriveError['code']; message: string }
}

export async function migrateAssetsToDrive(userId: string, opts: MigrateOptions = {}): Promise<MigrateResult> {
  const budgetMs = opts.budgetMs ?? 20_000
  const maxFiles = opts.maxFiles ?? 25
  const now = opts.now ?? Date.now
  const store = opts.store ?? getDriveAssetStore()
  const started = now()

  const conn = await getDriveConnection(userId)
  if (!conn.connected) {
    const err = new DriveError('not_connected')
    return {
      migrated: 0,
      failed: 0,
      remaining: await assetsQ.countPostgresHeld(userId),
      error: { code: err.code, message: err.message },
    }
  }

  const pending = await assetsQ.listPendingDriveMoves(userId, maxFiles)
  let migrated = 0
  let failed = 0
  let error: MigrateResult['error']
  for (const item of pending) {
    if (now() - started > budgetMs) break
    try {
      if (await migrateOne(store, userId, item)) migrated++
    } catch (err) {
      const de = toDriveError(err)
      logger.warn('drive_migrate_item_failed', { assetId: item.id, code: de.code })
      // Auth, quota and outage problems affect every file: stop the batch.
      if (de.code === 'reconnect' || de.code === 'not_connected' || de.code === 'quota' || de.code === 'unavailable') {
        error = { code: de.code, message: de.message }
        break
      }
      failed++
    }
  }
  return { migrated, failed, remaining: await assetsQ.countPostgresHeld(userId), error }
}

async function migrateOne(
  store: DriveAssetStore,
  userId: string,
  item: assetsQ.PendingDriveMove,
): Promise<boolean> {
  const client = store.client(userId)
  const bytes = (await assetsQ.bytesByIds(userId, [item.id])).get(item.id)
  if (!bytes) return false // moved concurrently or deleted

  let file: DriveFile | null = await client.findByAppProperty('employAssetId', item.id)
  if (file && (driveSize(file) !== bytes.byteLength || (await client.sha256Of(file)) !== item.sha256)) {
    // A partial or stale copy from an earlier run: replace it.
    await client.trash(file.id)
    file = null
  }
  file ??= await store.withFolders(userId, async (folders) =>
    client.uploadMultipart(
      {
        name: item.filename,
        mimeType: item.mimeType,
        parents: [await folders.documentAssets(item.documentId)],
        appProperties: {
          employAssetId: item.id,
          employDocumentId: item.documentId,
          employFilename: item.filename,
        },
      },
      bytes,
    ),
  )

  const driveSha = await client.sha256Of(file)
  if (driveSha !== item.sha256) {
    await client.trash(file.id).catch(() => undefined)
    throw new DriveError('verify_failed')
  }
  const moved = await assetsQ.moveBytesToDrive(userId, item.id, item.sha256, file.id)
  if (!moved) {
    // Row changed or vanished meanwhile; the bytea (if any) is untouched.
    // A concurrent run may have linked this very file: only trash an orphan.
    const current = await assetsQ.getMetaById(userId, item.id)
    if (current?.driveFileId !== file.id) await client.trash(file.id).catch(() => undefined)
  }
  return moved
}
