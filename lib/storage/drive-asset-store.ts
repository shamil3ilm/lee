import * as assetsQ from '@/lib/db/queries/documentAssets'
import * as pdfCacheQ from '@/lib/db/queries/documentPdfCache'
import { DriveClient, userTokenSource, type DriveFile } from '@/lib/drive/client'
import { DriveError } from '@/lib/drive/errors'
import { DriveFolders } from '@/lib/drive/folders'
import { logger } from '@/lib/logger'
import { mapWithConcurrency } from '@/lib/util/concurrency'
import type {
  AssetKey,
  AssetRef,
  AssetRefSource,
  AssetStore,
  AssetStream,
  AssetUsage,
  PutMeta,
  PutResult,
} from './types'

/**
 * Google Drive backend (A2). Bytes live in the user's own Drive under
 * lee/; Neon keeps only the Drive file id, name, size, MIME type and
 * sha256. Refs:
 *   drive:asset:<document_assets.id>
 *   drive:pdf:<document_id>:<cache_key>
 *
 * Every lookup goes through the user-scoped metadata row first, so a ref
 * (or a Drive file id) belonging to another user resolves to nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CACHE_KEY = /^[A-Za-z0-9_-]{1,128}$/
const READ_CONCURRENCY = 4

type ParsedRef =
  | { kind: 'asset'; id: string }
  | { kind: 'pdf'; documentId: string; cacheKey: string }

function parseRef(ref: AssetRef): ParsedRef | null {
  const parts = ref.split(':')
  if (parts[0] !== 'drive') return null
  if (parts[1] === 'asset' && parts.length === 3 && UUID.test(parts[2]!)) {
    return { kind: 'asset', id: parts[2]! }
  }
  if (parts[1] === 'pdf' && parts.length === 4 && UUID.test(parts[2]!) && parts[3]!.length > 0) {
    return { kind: 'pdf', documentId: parts[2]!, cacheKey: parts[3]! }
  }
  return null
}

function isNotFound(err: unknown): boolean {
  return err instanceof DriveError && err.code === 'not_found'
}

export interface DriveAssetStoreOptions {
  /** Injected for tests; defaults to a client using the user's stored tokens. */
  clientFor?: (userId: string) => DriveClient
}

export class DriveAssetStore implements AssetStore {
  readonly backend = 'drive'
  private readonly clientFor: (userId: string) => DriveClient

  constructor(opts: DriveAssetStoreOptions = {}) {
    this.clientFor = opts.clientFor ?? ((userId) => new DriveClient(userTokenSource(userId)))
  }

  refForDocumentAsset(asset: AssetRefSource): AssetRef {
    return `drive:asset:${asset.id}`
  }

  refForPdfCache(documentId: string, cacheKey: string): AssetRef {
    return `drive:pdf:${documentId}:${cacheKey}`
  }

  client(userId: string): DriveClient {
    return this.clientFor(userId)
  }

  folders(userId: string): DriveFolders {
    return new DriveFolders(userId, this.clientFor(userId))
  }

  /**
   * Run `fn` with the folder layout; if Drive says a cached folder is gone
   * (the user deleted it), forget the cache and try once more.
   */
  async withFolders<T>(userId: string, fn: (folders: DriveFolders) => Promise<T>): Promise<T> {
    const folders = this.folders(userId)
    try {
      return await fn(folders)
    } catch (err) {
      if (!isNotFound(err)) throw err
      await folders.invalidate()
      return fn(folders)
    }
  }

  async put(userId: string, key: AssetKey, bytes: Buffer, meta: PutMeta): Promise<PutResult> {
    const sha256 = assetsQ.sha256Hex(bytes)
    if (key.kind === 'pdf-cache') {
      if (!meta.cacheKey || !CACHE_KEY.test(meta.cacheKey)) {
        throw new Error('pdf-cache put requires a cacheKey token')
      }
      await this.putPdfCache(userId, key.documentId, meta.cacheKey, bytes)
      return {
        ref: this.refForPdfCache(key.documentId, meta.cacheKey),
        sizeBytes: bytes.byteLength,
        sha256,
      }
    }

    const filename = await assetsQ.validateNew(userId, key.documentId, {
      filename: key.filename,
      sizeBytes: bytes.byteLength,
    })
    const client = this.client(userId)
    const file = await this.withFolders(userId, async (folders) =>
      client.uploadMultipart(
        {
          name: filename,
          mimeType: meta.mimeType,
          parents: [await folders.documentAssets(key.documentId)],
          appProperties: { employDocumentId: key.documentId, employFilename: filename },
        },
        bytes,
      ),
    )
    await this.verifyOrTrash(client, file, sha256)
    try {
      const asset = await assetsQ.createDriveBacked(userId, key.documentId, {
        filename,
        mimeType: meta.mimeType,
        sizeBytes: bytes.byteLength,
        sha256,
        driveFileId: file.id,
      })
      return { ref: this.refForDocumentAsset(asset), sizeBytes: asset.sizeBytes, sha256, asset }
    } catch (err) {
      await client.trash(file.id).catch(() => undefined)
      throw err
    }
  }

  /** Drive's own sha256 must match what we sent; otherwise trash and fail. */
  private async verifyOrTrash(client: DriveClient, file: DriveFile, sha256: string): Promise<void> {
    if (file.sha256Checksum && file.sha256Checksum.toLowerCase() !== sha256) {
      logger.warn('drive_upload_hash_mismatch', { fileId: file.id })
      await client.trash(file.id).catch(() => undefined)
      throw new DriveError('verify_failed')
    }
  }

  private async putPdfCache(userId: string, documentId: string, cacheKey: string, bytes: Buffer): Promise<void> {
    const client = this.client(userId)
    const entry = await pdfCacheQ.getEntry(userId, documentId)
    let file: DriveFile | null = null
    if (entry?.driveFileId) {
      // One Drive file per document: overwrite in place.
      try {
        file = await client.updateMedia(entry.driveFileId, bytes, 'application/pdf')
      } catch (err) {
        if (!isNotFound(err)) throw err
      }
    }
    file ??= await this.withFolders(userId, async (folders) =>
      client.uploadMultipart(
        {
          name: `${documentId}.pdf`,
          mimeType: 'application/pdf',
          parents: [await folders.top('pdfs')],
          appProperties: { employDocumentId: documentId, employKind: 'pdf-cache' },
        },
        bytes,
      ),
    )
    await pdfCacheQ.upsertDrive(userId, documentId, cacheKey, bytes.byteLength, file.id)
  }

  async get(userId: string, ref: AssetRef): Promise<Buffer | null> {
    const parsed = parseRef(ref)
    if (!parsed) return null
    if (parsed.kind === 'pdf') return this.getPdf(userId, parsed.documentId, parsed.cacheKey)
    const meta = await assetsQ.getMetaById(userId, parsed.id)
    if (!meta) return null
    if (!meta.driveFileId) {
      // Not migrated yet: still in Postgres.
      return (await assetsQ.bytesByIds(userId, [meta.id])).get(meta.id) ?? null
    }
    try {
      return await this.client(userId).downloadBytes(meta.driveFileId)
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  private async getPdf(userId: string, documentId: string, cacheKey: string): Promise<Buffer | null> {
    const entry = await pdfCacheQ.getEntry(userId, documentId)
    if (!entry || entry.cacheKey !== cacheKey) return null
    if (entry.bytes) return entry.bytes
    if (!entry.driveFileId) return null
    try {
      return await this.client(userId).downloadBytes(entry.driveFileId)
    } catch (err) {
      // A cache read never fails the request: treat it as a miss.
      logger.warn('drive_pdf_cache_read_failed', {
        documentId,
        code: err instanceof DriveError ? err.code : 'unknown',
      })
      return null
    }
  }

  async getMany(userId: string, refs: readonly AssetRef[]): Promise<Map<AssetRef, Buffer>> {
    const out = new Map<AssetRef, Buffer>()
    await mapWithConcurrency(refs, READ_CONCURRENCY, async (ref) => {
      const b = await this.get(userId, ref)
      if (b) out.set(ref, b)
    })
    return out
  }

  async openStream(userId: string, ref: AssetRef): Promise<AssetStream | null> {
    const parsed = parseRef(ref)
    if (parsed?.kind !== 'asset') return null
    const meta = await assetsQ.getMetaById(userId, parsed.id)
    if (!meta) return null
    if (!meta.driveFileId) {
      const bytes = (await assetsQ.bytesByIds(userId, [meta.id])).get(meta.id)
      if (!bytes) return null
      return { body: new Blob([new Uint8Array(bytes)]).stream(), sizeBytes: bytes.byteLength }
    }
    try {
      const res = await this.client(userId).download(meta.driveFileId)
      if (!res.body) return null
      const len = Number(res.headers.get('content-length') ?? NaN)
      return { body: res.body, sizeBytes: Number.isFinite(len) ? len : null }
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  async delete(userId: string, ref: AssetRef): Promise<boolean> {
    const parsed = parseRef(ref)
    if (!parsed) return false
    const client = this.client(userId)
    if (parsed.kind === 'pdf') {
      const entry = await pdfCacheQ.getEntry(userId, parsed.documentId)
      if (!entry || entry.cacheKey !== parsed.cacheKey) return false
      if (entry.driveFileId) await client.trash(entry.driveFileId)
      return pdfCacheQ.remove(userId, parsed.documentId, parsed.cacheKey)
    }
    const meta = await assetsQ.getMetaById(userId, parsed.id)
    if (!meta) return false
    // A picked file is the user's own document: detach only, never trash.
    if (meta.driveFileId && !meta.drivePicked) await client.trash(meta.driveFileId)
    return assetsQ.removeById(userId, meta.id)
  }

  async usage(userId: string): Promise<AssetUsage> {
    const [assetBytes, cacheBytes, driveBytes] = await Promise.all([
      assetsQ.totalBytes(userId),
      pdfCacheQ.totalBytes(userId),
      assetsQ.driveTotalBytes(userId),
    ])
    return { assetBytes, cacheBytes, driveBytes }
  }
}
