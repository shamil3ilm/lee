import * as assetsQ from '@/lib/db/queries/documentAssets'
import * as pdfCacheQ from '@/lib/db/queries/documentPdfCache'
import {
  ASSET_QUOTA_BYTES,
  formatMegabytes,
  type AssetKey,
  type AssetRef,
  type AssetStore,
  type AssetUsage,
  type PutMeta,
  type PutResult,
} from './types'

/**
 * Postgres `bytea` backend. Document assets live in `document_assets.bytes`
 * (unchanged from v5.2) and compiled PDFs in `document_pdf_cache` (one row
 * per document). Refs:
 *   pg:asset:<document_assets.id>
 *   pg:pdf:<document_id>:<cache_key>
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Opaque token (a hex digest in practice); must not contain the ref separator.
const CACHE_KEY = /^[A-Za-z0-9_-]{1,128}$/

type ParsedRef =
  | { kind: 'asset'; id: string }
  | { kind: 'pdf'; documentId: string; cacheKey: string }

function parseRef(ref: AssetRef): ParsedRef | null {
  const parts = ref.split(':')
  if (parts[0] !== 'pg') return null
  if (parts[1] === 'asset' && parts.length === 3 && UUID.test(parts[2]!)) {
    return { kind: 'asset', id: parts[2]! }
  }
  if (parts[1] === 'pdf' && parts.length === 4 && UUID.test(parts[2]!) && parts[3]!.length > 0) {
    return { kind: 'pdf', documentId: parts[2]!, cacheKey: parts[3]! }
  }
  return null
}

export interface PostgresAssetStoreOptions {
  /** Per-user document-asset quota; defaults to ASSET_QUOTA_BYTES. */
  quotaBytes?: number
}

export class PostgresAssetStore implements AssetStore {
  readonly backend = 'postgres'
  private readonly quotaBytes: number

  constructor(opts: PostgresAssetStoreOptions = {}) {
    this.quotaBytes = opts.quotaBytes ?? ASSET_QUOTA_BYTES
  }

  refForDocumentAsset(asset: { id: string }): AssetRef {
    return `pg:asset:${asset.id}`
  }

  refForPdfCache(documentId: string, cacheKey: string): AssetRef {
    return `pg:pdf:${documentId}:${cacheKey}`
  }

  async put(userId: string, key: AssetKey, bytes: Buffer, meta: PutMeta): Promise<PutResult> {
    const sha256 = assetsQ.sha256Hex(bytes)
    if (key.kind === 'pdf-cache') {
      if (!meta.cacheKey || !CACHE_KEY.test(meta.cacheKey)) {
        throw new Error('pdf-cache put requires a cacheKey token')
      }
      await pdfCacheQ.upsert(userId, key.documentId, meta.cacheKey, bytes)
      return {
        ref: this.refForPdfCache(key.documentId, meta.cacheKey),
        sizeBytes: bytes.byteLength,
        sha256,
      }
    }
    await this.assertWithinQuota(userId, bytes.byteLength)
    const asset = await assetsQ.create(userId, key.documentId, {
      filename: key.filename,
      mimeType: meta.mimeType,
      sizeBytes: bytes.byteLength,
      bytes,
    })
    return { ref: this.refForDocumentAsset(asset), sizeBytes: asset.sizeBytes, sha256, asset }
  }

  async get(userId: string, ref: AssetRef): Promise<Buffer | null> {
    const parsed = parseRef(ref)
    if (!parsed) return null
    if (parsed.kind === 'pdf') {
      return pdfCacheQ.getBytes(userId, parsed.documentId, parsed.cacheKey)
    }
    const found = await assetsQ.bytesByIds(userId, [parsed.id])
    return found.get(parsed.id) ?? null
  }

  async getMany(userId: string, refs: readonly AssetRef[]): Promise<Map<AssetRef, Buffer>> {
    const out = new Map<AssetRef, Buffer>()
    const assetIds = new Map<string, AssetRef>()
    const others: AssetRef[] = []
    for (const ref of refs) {
      const parsed = parseRef(ref)
      if (parsed?.kind === 'asset') assetIds.set(parsed.id, ref)
      else if (parsed) others.push(ref)
    }
    // One query for every asset — the compile path bundles them all.
    const bytes = await assetsQ.bytesByIds(userId, [...assetIds.keys()])
    for (const [id, ref] of assetIds) {
      const b = bytes.get(id)
      if (b) out.set(ref, b)
    }
    for (const ref of others) {
      const b = await this.get(userId, ref)
      if (b) out.set(ref, b)
    }
    return out
  }

  async delete(userId: string, ref: AssetRef): Promise<boolean> {
    const parsed = parseRef(ref)
    if (!parsed) return false
    if (parsed.kind === 'pdf') return pdfCacheQ.remove(userId, parsed.documentId, parsed.cacheKey)
    return assetsQ.removeById(userId, parsed.id)
  }

  async usage(userId: string): Promise<AssetUsage> {
    const [assetBytes, cacheBytes] = await Promise.all([
      assetsQ.totalBytes(userId),
      pdfCacheQ.totalBytes(userId),
    ])
    return { assetBytes, cacheBytes }
  }

  private async assertWithinQuota(userId: string, incoming: number): Promise<void> {
    const used = await assetsQ.totalBytes(userId)
    if (used + incoming > this.quotaBytes) {
      throw new assetsQ.AssetValidationError(
        'quota_exceeded',
        `This upload would go over your ${formatMegabytes(this.quotaBytes)} file storage limit ` +
          `(${formatMegabytes(used)} used). Delete files you no longer need and try again.`,
      )
    }
  }
}
