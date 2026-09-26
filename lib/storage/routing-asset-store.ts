import * as pdfCacheQ from '@/lib/db/queries/documentPdfCache'
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
 * Per-user view over both backends: writes go to the user's chosen backend
 * (Drive when connected and enabled, else Postgres), reads and deletes go to
 * whichever backend the ref names. So files stay readable across a switch
 * and during a half-finished migration.
 */
export class RoutingAssetStore implements AssetStore {
  constructor(
    private readonly writer: AssetStore,
    private readonly postgres: AssetStore,
    private readonly drive: AssetStore,
    /** Trash a superseded Drive file (best effort). */
    private readonly trashDriveFile?: (userId: string, fileId: string) => Promise<void>,
  ) {}

  get backend(): string {
    return this.writer.backend
  }

  private pick(ref: AssetRef): AssetStore {
    return ref.startsWith('drive:') ? this.drive : this.postgres
  }

  refForDocumentAsset(asset: AssetRefSource): AssetRef {
    return asset.driveFileId
      ? this.drive.refForDocumentAsset(asset)
      : this.postgres.refForDocumentAsset(asset)
  }

  refForPdfCache(documentId: string, cacheKey: string): AssetRef {
    return this.writer.refForPdfCache(documentId, cacheKey)
  }

  async put(userId: string, key: AssetKey, bytes: Buffer, meta: PutMeta): Promise<PutResult> {
    if (key.kind !== 'pdf-cache' || this.writer === this.drive || !this.trashDriveFile) {
      return this.writer.put(userId, key, bytes, meta)
    }
    // The Postgres cache upsert replaces a Drive-held entry: trash the old
    // Drive copy (best effort) instead of orphaning it.
    const previous = await pdfCacheQ.getEntry(userId, key.documentId)
    const result = await this.writer.put(userId, key, bytes, meta)
    if (previous?.driveFileId) await this.trashDriveFile(userId, previous.driveFileId).catch(() => undefined)
    return result
  }

  get(userId: string, ref: AssetRef): Promise<Buffer | null> {
    return this.pick(ref).get(userId, ref)
  }

  async getMany(userId: string, refs: readonly AssetRef[]): Promise<Map<AssetRef, Buffer>> {
    const driveRefs = refs.filter((r) => r.startsWith('drive:'))
    const pgRefs = refs.filter((r) => !r.startsWith('drive:'))
    const [a, b] = await Promise.all([
      pgRefs.length ? this.postgres.getMany(userId, pgRefs) : new Map<AssetRef, Buffer>(),
      driveRefs.length ? this.drive.getMany(userId, driveRefs) : new Map<AssetRef, Buffer>(),
    ])
    return new Map([...a, ...b])
  }

  async openStream(userId: string, ref: AssetRef): Promise<AssetStream | null> {
    const store = this.pick(ref)
    if (store.openStream) return store.openStream(userId, ref)
    const bytes = await store.get(userId, ref)
    if (!bytes) return null
    return { body: new Blob([new Uint8Array(bytes)]).stream(), sizeBytes: bytes.byteLength }
  }

  delete(userId: string, ref: AssetRef): Promise<boolean> {
    return this.pick(ref).delete(userId, ref)
  }

  usage(userId: string): Promise<AssetUsage> {
    // The Drive store's usage already reports the Postgres-held bytes too.
    return this.drive.usage(userId)
  }
}
