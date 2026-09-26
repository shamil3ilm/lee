import { randomUUID } from 'node:crypto'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { getDriveAssetStore } from '@/lib/storage/asset-store'
import { driveSize, type DriveClient, type DriveFile } from './client'
import { DriveError } from './errors'

/**
 * Browser-direct uploads and Picker attachments for document assets (A2).
 *
 * Direct upload: the server validates the request and opens a Drive
 * resumable session in the user's lee/Documents/<doc>/assets folder; the
 * browser PUTs the bytes to the session URI (no token in the browser, no
 * bytes through Vercel), then calls `completeAssetUpload`, which re-reads
 * the file's metadata from Drive before recording it.
 */

const GOOGLE_NATIVE = 'application/vnd.google-apps.'

export interface UploadSession {
  uploadUrl: string
  uploadId: string
  filename: string
}

export async function createAssetUploadSession(input: {
  userId: string
  documentId: string
  filename: string
  mimeType: string
  sizeBytes: number
  origin?: string
}): Promise<UploadSession> {
  const filename = await assetsQ.validateNew(input.userId, input.documentId, {
    filename: input.filename,
    sizeBytes: input.sizeBytes,
  })
  const store = getDriveAssetStore()
  const client = store.client(input.userId)
  const uploadId = randomUUID()
  const uploadUrl = await store.withFolders(input.userId, async (folders) =>
    client.createResumableSession(
      {
        name: filename,
        mimeType: input.mimeType || 'application/octet-stream',
        parents: [await folders.documentAssets(input.documentId)],
        appProperties: {
          employDocumentId: input.documentId,
          employFilename: filename,
          employUploadId: uploadId,
        },
      },
      { sizeBytes: input.sizeBytes, origin: input.origin },
    ),
  )
  return { uploadUrl, uploadId, filename }
}

/**
 * Record a browser-uploaded Drive file. Trusts nothing from the client but
 * the file id: the file must be one lee created for this document
 * (appProperties) inside its assets folder, within the size cap.
 */
export async function completeAssetUpload(input: {
  userId: string
  documentId: string
  fileId: string
}): Promise<assetsQ.AssetMetadata> {
  const store = getDriveAssetStore()
  const client = store.client(input.userId)
  const file = await client.getFile(input.fileId)
  const folder = await store.folders(input.userId).documentAssets(input.documentId)
  if (
    file.trashed ||
    file.appProperties?.employDocumentId !== input.documentId ||
    !file.parents?.includes(folder) ||
    !file.appProperties?.employFilename
  ) {
    throw new DriveError('verify_failed')
  }
  return registerDriveFile(client, input.userId, input.documentId, file, {
    filename: file.appProperties.employFilename,
    picked: false,
  })
}

/**
 * The browser-direct PUT may have reached Drive even though the browser saw
 * an error (e.g. a blocked CORS response). Before a server-side retry, look
 * for that upload by its id and register it instead of uploading twice.
 */
export async function findStrandedUpload(
  userId: string,
  documentId: string,
  uploadId: string,
  expectedSize: number,
): Promise<assetsQ.AssetMetadata | null> {
  const store = getDriveAssetStore()
  const client = store.client(userId)
  const file = await client.findByAppProperty('employUploadId', uploadId)
  if (!file || file.appProperties?.employDocumentId !== documentId) return null
  if (driveSize(file) !== expectedSize || !file.appProperties.employFilename) {
    // Partial or mismatched: discard it and let the retry upload fresh.
    await client.trash(file.id).catch(() => undefined)
    return null
  }
  return registerDriveFile(client, userId, documentId, file, {
    filename: file.appProperties.employFilename,
    picked: false,
  })
}

/**
 * "Attach from Drive": the Picker granted lee drive.file access to one
 * of the user's own files. The asset references it in place (no copy) and
 * is never trashed on removal.
 */
export async function attachPickedFile(input: {
  userId: string
  documentId: string
  fileId: string
}): Promise<assetsQ.AssetMetadata> {
  const client = getDriveAssetStore().client(input.userId)
  const file = await client.getFile(input.fileId)
  if (file.trashed) throw new DriveError('not_found')
  if (file.mimeType.startsWith(GOOGLE_NATIVE)) {
    throw new DriveError(
      'unsupported',
      'Google Docs, Sheets and Slides cannot be attached directly. Download a PDF copy to Drive first.',
    )
  }
  return registerDriveFile(client, input.userId, input.documentId, file, {
    filename: file.name,
    picked: true,
  })
}

async function registerDriveFile(
  client: DriveClient,
  userId: string,
  documentId: string,
  file: DriveFile,
  opts: { filename: string; picked: boolean },
): Promise<assetsQ.AssetMetadata> {
  const sizeBytes = driveSize(file)
  // Idempotent: a repeated "complete" for the same file returns the row.
  const existing = (await assetsQ.list(userId, documentId)).find((a) => a.driveFileId === file.id)
  if (existing) return existing
  try {
    const filename = await assetsQ.validateNew(userId, documentId, { filename: opts.filename, sizeBytes })
    const sha256 = await client.sha256Of(file)
    return await assetsQ.createDriveBacked(userId, documentId, {
      filename,
      mimeType: file.mimeType || 'application/octet-stream',
      sizeBytes,
      sha256,
      driveFileId: file.id,
      drivePicked: opts.picked,
    })
  } catch (err) {
    // Never leave an orphan lee upload behind; a picked file is the
    // user's own and is left alone.
    if (!opts.picked) await client.trash(file.id).catch(() => undefined)
    throw err
  }
}
