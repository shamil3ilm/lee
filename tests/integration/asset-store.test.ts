import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as docsQ from '@/lib/db/queries/documents'
import { AssetValidationError, sha256Hex } from '@/lib/db/queries/documentAssets'
import { ASSET_QUOTA_BYTES, getAssetStore } from '@/lib/storage/asset-store'
import { PostgresAssetStore } from '@/lib/storage/postgres-asset-store'
import { makeUser } from '@/tests/factories'

async function seedDoc() {
  const u = await makeUser()
  const doc = await docsQ.create(u.id, {
    applicationId: null,
    kind: 'latex_cv',
    version: 1,
    title: 'CV',
    content: { source: 'x' },
  })
  return { u, doc }
}

const bytes = (n: number, fill = 7): Buffer => Buffer.alloc(n, fill)

describe('asset store (postgres backend)', () => {
  it('defaults to the postgres backend with a 150 MB quota', () => {
    expect(getAssetStore().backend).toBe('postgres')
    expect(ASSET_QUOTA_BYTES).toBe(150 * 1024 * 1024)
  })

  it('puts, reads, lists usage and deletes a document asset', async () => {
    const { u, doc } = await seedDoc()
    const store = new PostgresAssetStore()
    const payload = bytes(10)
    const put = await store.put(
      u.id,
      { kind: 'document-asset', documentId: doc.id, filename: 'photo one.jpg' },
      payload,
      { mimeType: 'image/jpeg' },
    )
    expect(put.sizeBytes).toBe(10)
    expect(put.sha256).toBe(sha256Hex(payload))
    expect(put.asset).toMatchObject({ filename: 'photo_one.jpg', mimeType: 'image/jpeg', sizeBytes: 10 })
    expect(store.refForDocumentAsset(put.asset!)).toBe(put.ref)

    expect(await store.get(u.id, put.ref)).toEqual(payload)
    const many = await store.getMany(u.id, [put.ref])
    expect(many.get(put.ref)).toEqual(payload)
    expect(await store.usage(u.id)).toEqual({ assetBytes: 10, cacheBytes: 0 })

    // Another user can never read it through a known ref.
    const other = await makeUser()
    expect(await store.get(other.id, put.ref)).toBeNull()
    expect(await store.delete(other.id, put.ref)).toBe(false)

    expect(await store.delete(u.id, put.ref)).toBe(true)
    expect(await store.get(u.id, put.ref)).toBeNull()
    expect(await store.usage(u.id)).toEqual({ assetBytes: 0, cacheBytes: 0 })
  })

  it('rejects an upload that would exceed the per-user quota with a friendly error', async () => {
    const { u, doc } = await seedDoc()
    const store = new PostgresAssetStore({ quotaBytes: 25 })
    await store.put(u.id, { kind: 'document-asset', documentId: doc.id, filename: 'a.bin' }, bytes(20), {
      mimeType: 'application/octet-stream',
    })
    const err = await store
      .put(u.id, { kind: 'document-asset', documentId: doc.id, filename: 'b.bin' }, bytes(6), {
        mimeType: 'application/octet-stream',
      })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AssetValidationError)
    expect((err as AssetValidationError).code).toBe('quota_exceeded')
    expect((err as Error).message).toMatch(/storage limit/i)
    // Exactly at the limit is fine; the PDF cache never counts against it.
    await store.put(u.id, { kind: 'pdf-cache', documentId: doc.id }, bytes(100), {
      mimeType: 'application/pdf',
      cacheKey: 'k1',
    })
    await store.put(u.id, { kind: 'document-asset', documentId: doc.id, filename: 'c.bin' }, bytes(5), {
      mimeType: 'application/octet-stream',
    })
    expect(await store.usage(u.id)).toEqual({ assetBytes: 25, cacheBytes: 100 })
  })

  it('keeps one pdf-cache entry per document and only serves it for the matching key', async () => {
    const { u, doc } = await seedDoc()
    const store = new PostgresAssetStore()
    const first = await store.put(u.id, { kind: 'pdf-cache', documentId: doc.id }, bytes(4, 1), {
      mimeType: 'application/pdf',
      cacheKey: 'k1',
    })
    const second = await store.put(u.id, { kind: 'pdf-cache', documentId: doc.id }, bytes(4, 2), {
      mimeType: 'application/pdf',
      cacheKey: 'k2',
    })
    expect(await db.select().from(s.documentPdfCache).where(eq(s.documentPdfCache.documentId, doc.id))).toHaveLength(1)
    expect(await store.get(u.id, first.ref)).toBeNull()
    expect(await store.get(u.id, second.ref)).toEqual(bytes(4, 2))
    expect(store.refForPdfCache(doc.id, 'k2')).toBe(second.ref)
  })

  it('returns null for malformed or foreign refs', async () => {
    const { u } = await seedDoc()
    const store = new PostgresAssetStore()
    expect(await store.get(u.id, 'gdrive:abc')).toBeNull()
    expect(await store.get(u.id, 'pg:asset:not-a-uuid')).toBeNull()
    expect(await store.delete(u.id, 'nonsense')).toBe(false)
  })
})
