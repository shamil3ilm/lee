import * as cvScoresQ from '@/lib/db/queries/cvScores'
import { getDriveAssetStore } from '@/lib/storage/asset-store'
import { getDriveConnection } from './connection'
import { logger } from '@/lib/logger'
import { DriveError, toDriveError } from './errors'

export type CvCopyResult = { saved: true; driveFileId: string } | { saved: false; error: string; connect?: boolean }

/**
 * Opt-in "Save a copy to Drive" for CV score uploads: store the uploaded
 * file in lee/CVs and link the cv_scores row to it so the history can
 * reopen it. Never throws: scoring already succeeded, so a Drive problem is
 * reported next to the result instead of failing the request.
 */
export async function saveCvCopyToDrive(input: {
  userId: string
  scoreId: string | null
  name: string
  mimeType: string
  bytes: Uint8Array
  now?: Date
}): Promise<CvCopyResult> {
  try {
    const conn = await getDriveConnection(input.userId)
    if (!conn.connected) throw new DriveError('not_connected')
    const store = getDriveAssetStore()
    const client = store.client(input.userId)
    const day = (input.now ?? new Date()).toISOString().slice(0, 10)
    const file = await store.withFolders(input.userId, async (folders) =>
      client.uploadMultipart(
        {
          name: `${day} ${input.name}`.slice(0, 200),
          mimeType: input.mimeType || 'application/octet-stream',
          parents: [await folders.top('cvs')],
          appProperties: input.scoreId ? { employCvScoreId: input.scoreId } : {},
        },
        input.bytes,
      ),
    )
    if (input.scoreId) await cvScoresQ.setDriveFile(input.userId, input.scoreId, file.id)
    return { saved: true, driveFileId: file.id }
  } catch (err) {
    const de = toDriveError(err)
    logger.warn('drive_cv_copy_failed', {
      code: de.code,
      err: err instanceof Error ? err.message : String(err),
    })
    return { saved: false, error: de.message, connect: de.needsConnect || undefined }
  }
}
