import * as assetsQ from '@/lib/db/queries/documentAssets'
import * as pdfCacheQ from '@/lib/db/queries/documentPdfCache'
import { logger } from '@/lib/logger'
import { getDriveAssetStore } from '@/lib/storage/asset-store'
import { toDriveError } from './errors'

/**
 * Before a document is deleted (rows cascade), move the Drive files lee
 * created for it to the Drive trash (recoverable for 30 days). Picked files
 * are the user's own and are left alone. Best effort: a Drive problem is
 * logged and never blocks the delete. Returns how many files were trashed.
 */
export async function trashDocumentDriveFiles(userId: string, documentId: string): Promise<number> {
  const [assets, cache] = await Promise.all([
    assetsQ.list(userId, documentId),
    pdfCacheQ.getEntry(userId, documentId),
  ])
  const ids = assets.filter((a) => a.driveFileId && !a.drivePicked).map((a) => a.driveFileId!)
  if (cache?.driveFileId) ids.push(cache.driveFileId)
  if (ids.length === 0) return 0
  const client = getDriveAssetStore().client(userId)
  let trashed = 0
  for (const id of ids) {
    try {
      await client.trash(id)
      trashed++
    } catch (err) {
      logger.warn('drive_document_cleanup_failed', { documentId, code: toDriveError(err).code })
      if (toDriveError(err).needsConnect) break
    }
  }
  return trashed
}
