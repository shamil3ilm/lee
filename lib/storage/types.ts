import type { AssetMetadata } from '@/lib/db/queries/documentAssets'

/**
 * Contract for byte storage of user files (LaTeX document assets) and
 * derived blobs (the compiled-PDF cache). See lib/storage/asset-store.ts.
 */

/** Per-user upload quota for document assets (Postgres backend). */
export const ASSET_QUOTA_BYTES = 150 * 1024 * 1024

/** Compiled PDFs larger than this are served but not cached. */
export const MAX_PDF_CACHE_BYTES = 5 * 1024 * 1024

export type AssetKey =
  | { kind: 'document-asset'; documentId: string; filename: string }
  | { kind: 'pdf-cache'; documentId: string }

/** Opaque, backend-prefixed reference (`pg:…` for the Postgres backend). */
export type AssetRef = string

export interface PutMeta {
  mimeType: string
  /** pdf-cache only: the source+assets hash the bytes were compiled from. */
  cacheKey?: string
}

export interface PutResult {
  ref: AssetRef
  sizeBytes: number
  sha256: string
  /** document-asset only: the stored row's metadata (sanitised filename…). */
  asset?: AssetMetadata
}

export interface AssetUsage {
  /** User-uploaded bytes — what the quota limits. */
  assetBytes: number
  /** Derived, evictable cache bytes (not counted against the quota). */
  cacheBytes: number
}

export interface AssetStore {
  readonly backend: string
  /**
   * Store bytes. Throws AssetValidationError (e.g. `quota_exceeded`,
   * `file_too_large`, `filename_conflict`) for user-facing rejections.
   */
  put(userId: string, key: AssetKey, bytes: Buffer, meta: PutMeta): Promise<PutResult>
  get(userId: string, ref: AssetRef): Promise<Buffer | null>
  getMany(userId: string, refs: readonly AssetRef[]): Promise<Map<AssetRef, Buffer>>
  delete(userId: string, ref: AssetRef): Promise<boolean>
  usage(userId: string): Promise<AssetUsage>
  /** Ref for an asset listed from document_assets metadata. */
  refForDocumentAsset(asset: Pick<AssetMetadata, 'id'>): AssetRef
  /** Ref for a document's cached PDF compiled under `cacheKey`. */
  refForPdfCache(documentId: string, cacheKey: string): AssetRef
}

/** "12.3 MB" — for user-facing quota messages. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}
