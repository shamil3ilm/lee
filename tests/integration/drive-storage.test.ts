import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as docsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import * as profileQ from '@/lib/db/queries/profile'
import { DriveError } from '@/lib/drive/errors'
import { getDriveConnection } from '@/lib/drive/connection'
import { getAssetStoreForUser, type AssetStore } from '@/lib/storage/asset-store'
import { PostgresAssetStore } from '@/lib/storage/postgres-asset-store'
import { DriveAssetStore } from '@/lib/storage/drive-asset-store'
import { RoutingAssetStore } from '@/lib/storage/routing-asset-store'
import { makeUser } from '@/tests/factories'
import { trashDocumentDriveFiles } from '@/lib/drive/cleanup'
import { safeMimeType } from '@/lib/drive/client'
import { FakeDrive } from '@/tests/fixtures/fake-drive'
import { driveUser } from '@/tests/fixtures/drive-user'

const originalFetch = globalThis.fetch
let drive: FakeDrive

beforeEach(() => {
  drive = new FakeDrive()
  globalThis.fetch = drive.fetch as unknown as typeof fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

async function makeDoc(userId: string, title = 'My CV') {
  return docsQ.create(userId, {
    applicationId: null,
    kind: 'latex_cv',
    version: 1,
    title,
    content: { source: 'x' },
  })
}

const bytes = (n: number, fill = 7): Buffer => Buffer.alloc(n, fill)

async function putAsset(store: AssetStore, userId: string, documentId: string, filename: string, b = bytes(10)) {
  return store.put(userId, { kind: 'document-asset', documentId, filename }, b, { mimeType: 'image/png' })
}

describe('drive connection + store selection', () => {
  it('detects drive.file on the stored scope and picks the Drive writer', async () => {
    const u = await driveUser()
    expect(await getDriveConnection(u.id)).toEqual({ hasGoogleAccount: true, connected: true, enabled: true })
    expect((await getAssetStoreForUser(u.id)).backend).toBe('drive')
  })

  it('falls back to capped Postgres without drive.file, without Google, or when toggled off', async () => {
    const noScope = await driveUser({ scope: 'openid email' })
    expect((await getDriveConnection(noScope.id)).connected).toBe(false)
    expect((await getAssetStoreForUser(noScope.id)).backend).toBe('postgres')

    const noGoogle = await makeUser()
    expect(await getDriveConnection(noGoogle.id)).toEqual({ hasGoogleAccount: false, connected: false, enabled: true })
    expect((await getAssetStoreForUser(noGoogle.id)).backend).toBe('postgres')

    const off = await driveUser()
    await profileQ.upsert(off.id, { driveStorageEnabled: false })
    expect((await getAssetStoreForUser(off.id)).backend).toBe('postgres')
    expect(drive.calls).toHaveLength(0)
  })

  it('quota fallback: a Postgres-backed user still hits the cap with a friendly error', async () => {
    const u = await driveUser({ scope: 'openid email' })
    const doc = await makeDoc(u.id)
    const pg = new PostgresAssetStore({ quotaBytes: 12 })
    const store = new RoutingAssetStore(pg, pg, new DriveAssetStore())
    await putAsset(store, u.id, doc.id, 'a.png', bytes(10))
    const err = await putAsset(store, u.id, doc.id, 'b.png', bytes(5)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(assetsQ.AssetValidationError)
    expect((err as Error).message).toMatch(/storage limit/i)
  })

  it('Drive-held bytes do not count against the Postgres quota', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const store = await getAssetStoreForUser(u.id)
    await putAsset(store, u.id, doc.id, 'a.png', bytes(40))
    expect(await assetsQ.totalBytes(u.id)).toBe(0)
    expect(await store.usage(u.id)).toEqual({ assetBytes: 0, cacheBytes: 0, driveBytes: 40 })
  })
})

describe('DriveAssetStore', () => {
  it('creates Employ/Documents/<title-id>/assets once and stores only metadata in Neon', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id, 'Backend CV')
    const store = await getAssetStoreForUser(u.id)
    const payload = bytes(10)
    const put = await putAsset(store, u.id, doc.id, 'photo one.png', payload)
    expect(put.ref).toBe(`drive:asset:${put.asset!.id}`)
    expect(put.asset).toMatchObject({ filename: 'photo_one.png', drivePicked: false })
    expect(put.asset!.driveFileId).toMatch(/^drv_/)

    const folders = [...drive.files.values()].filter((f) => f.mimeType === 'application/vnd.google-apps.folder')
    const byName = (n: string) => folders.find((f) => f.name === n)!
    expect(folders.map((f) => f.name).sort()).toEqual(
      ['Documents', 'Employ', `Backend CV-${doc.id.slice(0, 8)}`, 'assets'].sort(),
    )
    expect(byName('Employ').parents).toEqual(['root'])
    expect(byName('Documents').parents).toEqual([byName('Employ').id])
    expect(byName('assets').parents).toEqual([byName(`Backend CV-${doc.id.slice(0, 8)}`).id])
    expect(drive.files.get(put.asset!.driveFileId!)!.parents).toEqual([byName('assets').id])

    const [row] = await db.select().from(s.documentAssets).where(eq(s.documentAssets.id, put.asset!.id))
    expect(row!.bytes).toBeNull()
    expect(row!.sha256).toBe(assetsQ.sha256Hex(payload))

    // Second upload: folder ids come from the drive_folders cache.
    const creates = drive.folderCreates()
    const listCalls = drive.calls.filter((c) => c.method === 'GET' && c.url.includes('/drive/v3/files?')).length
    await putAsset(store, u.id, doc.id, 'two.png')
    expect(drive.folderCreates()).toBe(creates)
    expect(drive.calls.filter((c) => c.method === 'GET' && c.url.includes('/drive/v3/files?')).length).toBe(listCalls)
    const cached = await db.select().from(s.driveFolders).where(eq(s.driveFolders.userId, u.id))
    expect(cached.map((r) => r.folderKey).sort()).toEqual(
      ['documents', `doc-assets:${doc.id}`, `doc:${doc.id}`, 'root'].sort(),
    )
  })

  it('reads back through get / getMany / openStream (download via alt=media)', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const store = await getAssetStoreForUser(u.id)
    const payload = bytes(33, 3)
    const put = await putAsset(store, u.id, doc.id, 'a.png', payload)
    expect(await store.get(u.id, put.ref)).toEqual(payload)
    expect((await store.getMany(u.id, [put.ref])).get(put.ref)).toEqual(payload)
    const stream = await store.openStream!(u.id, put.ref)
    expect(stream!.sizeBytes).toBe(33)
    expect(Buffer.from(await new Response(stream!.body).arrayBuffer())).toEqual(payload)
    expect(drive.calls.some((c) => c.url.includes('alt=media'))).toBe(true)
  })

  it('re-creates the layout when the user deleted the cached folder', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const store = await getAssetStoreForUser(u.id)
    await putAsset(store, u.id, doc.id, 'a.png')
    // Simulate the user deleting Employ/ in Drive: every folder disappears.
    for (const f of [...drive.files.values()]) drive.files.delete(f.id)
    const again = await putAsset(store, u.id, doc.id, 'b.png')
    expect(drive.files.get(again.asset!.driveFileId!)).toBeDefined()
  })

  it('delete trashes the Drive file (recoverable) and removes the row', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const store = await getAssetStoreForUser(u.id)
    const put = await putAsset(store, u.id, doc.id, 'a.png')
    expect(await store.delete(u.id, put.ref)).toBe(true)
    expect(drive.files.get(put.asset!.driveFileId!)!.trashed).toBe(true)
    expect(await assetsQ.list(u.id, doc.id)).toHaveLength(0)
  })

  it('a Drive-full answer becomes a friendly quota error and stores nothing', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const store = await getAssetStoreForUser(u.id)
    await putAsset(store, u.id, doc.id, 'warm.png') // folders exist
    drive.quotaFull = true
    const err = await putAsset(store, u.id, doc.id, 'b.png').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DriveError)
    expect((err as DriveError).code).toBe('quota')
    expect((err as Error).message).toMatch(/Drive storage is full/)
    expect(await assetsQ.list(u.id, doc.id)).toHaveLength(1)
  })

  it('keeps the compiled-PDF cache as one Drive file per document (overwritten in place)', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const store = await getAssetStoreForUser(u.id)
    await store.put(u.id, { kind: 'pdf-cache', documentId: doc.id }, bytes(20, 1), {
      mimeType: 'application/pdf',
      cacheKey: 'k1',
    })
    expect(await store.get(u.id, store.refForPdfCache(doc.id, 'k1'))).toEqual(bytes(20, 1))
    await store.put(u.id, { kind: 'pdf-cache', documentId: doc.id }, bytes(21, 2), {
      mimeType: 'application/pdf',
      cacheKey: 'k2',
    })
    expect(await store.get(u.id, store.refForPdfCache(doc.id, 'k1'))).toBeNull()
    expect(await store.get(u.id, store.refForPdfCache(doc.id, 'k2'))).toEqual(bytes(21, 2))
    expect(drive.count((f) => f.mimeType === 'application/pdf')).toBe(1)
    const [row] = await db.select().from(s.documentPdfCache).where(eq(s.documentPdfCache.documentId, doc.id))
    expect(row!.bytes).toBeNull()
  })
})

describe('revoked or expired grant', () => {
  it('surfaces "Reconnect Google Drive" and keeps the metadata', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const store = await getAssetStoreForUser(u.id)
    const put = await putAsset(store, u.id, doc.id, 'a.png')
    drive.revoked = true
    for (const op of [
      () => store.get(u.id, put.ref),
      () => putAsset(store, u.id, doc.id, 'b.png'),
      () => store.delete(u.id, put.ref),
    ]) {
      const err = await op().catch((e: unknown) => e)
      expect(err).toBeInstanceOf(DriveError)
      expect((err as DriveError).code).toBe('reconnect')
      expect((err as DriveError).needsConnect).toBe(true)
      expect((err as Error).message).toMatch(/Reconnect Google Drive/)
    }
    expect(await assetsQ.list(u.id, doc.id)).toHaveLength(1)
  })

  it('maps an invalid_grant token refresh to reconnect', async () => {
    const u = await driveUser({ expired: true })
    const doc = await makeDoc(u.id)
    drive.tokenResponse = { status: 400, body: { error: 'invalid_grant' } }
    const store = await getAssetStoreForUser(u.id)
    const err = await putAsset(store, u.id, doc.id, 'a.png').catch((e: unknown) => e)
    expect((err as DriveError).code).toBe('reconnect')
  })
})

describe('scoping', () => {
  it("another user's refs and Drive files resolve to nothing", async () => {
    const a = await driveUser()
    const b = await driveUser()
    const doc = await makeDoc(a.id)
    const storeA = await getAssetStoreForUser(a.id)
    const put = await putAsset(storeA, a.id, doc.id, 'a.png')
    const storeB = await getAssetStoreForUser(b.id)
    expect(await storeB.get(b.id, put.ref)).toBeNull()
    expect(await storeB.openStream!(b.id, put.ref)).toBeNull()
    expect((await storeB.getMany(b.id, [put.ref])).size).toBe(0)
    expect(await storeB.delete(b.id, put.ref)).toBe(false)
    expect(drive.files.get(put.asset!.driveFileId!)!.trashed).toBe(false)
    // B cannot even fetch A's Drive file with B's own token (drive.file).
    const direct = new DriveAssetStore().client(b.id)
    await expect(direct.getFile(put.asset!.driveFileId!)).rejects.toMatchObject({ code: 'not_found' })
    // And B's rows never see A's asset.
    const rows = await db
      .select()
      .from(s.documentAssets)
      .where(and(eq(s.documentAssets.userId, b.id)))
    expect(rows).toHaveLength(0)
  })
})

describe('cleanup', () => {
  it('trashes Employ-created Drive files (not picked ones) before a document is deleted', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const store = await getAssetStoreForUser(u.id)
    const put = await putAsset(store, u.id, doc.id, 'a.png')
    await store.put(u.id, { kind: 'pdf-cache', documentId: doc.id }, bytes(5), { mimeType: 'application/pdf', cacheKey: 'k' })
    const mine = drive.seed(`tok-${u.id}`, { name: 'own.pdf', mimeType: 'application/pdf', bytes: bytes(3) })
    await assetsQ.createDriveBacked(u.id, doc.id, {
      filename: 'own.pdf', mimeType: 'application/pdf', sizeBytes: 3, sha256: 'x', driveFileId: mine.id, drivePicked: true,
    })
    expect(await trashDocumentDriveFiles(u.id, doc.id)).toBe(2)
    expect(drive.files.get(put.asset!.driveFileId!)!.trashed).toBe(true)
    expect(drive.files.get(mine.id)!.trashed).toBe(false)
  })

  it('trashes the old Drive PDF cache when the cache moves back to Postgres', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const onDrive = await getAssetStoreForUser(u.id)
    await onDrive.put(u.id, { kind: 'pdf-cache', documentId: doc.id }, bytes(5), { mimeType: 'application/pdf', cacheKey: 'k1' })
    const [before] = await db.select().from(s.documentPdfCache).where(eq(s.documentPdfCache.documentId, doc.id))
    await profileQ.upsert(u.id, { driveStorageEnabled: false })
    const onPg = await getAssetStoreForUser(u.id)
    await onPg.put(u.id, { kind: 'pdf-cache', documentId: doc.id }, bytes(6), { mimeType: 'application/pdf', cacheKey: 'k2' })
    expect(drive.files.get(before!.driveFileId!)!.trashed).toBe(true)
    expect(await onPg.get(u.id, onPg.refForPdfCache(doc.id, 'k2'))).toEqual(bytes(6))
  })

  it('never lets a MIME type carry header syntax into the multipart body', () => {
    expect(safeMimeType('image/png')).toBe('image/png')
    expect(safeMimeType(`image/png${String.fromCharCode(13, 10)}X-Evil: 1`)).toBe('application/octet-stream')
    expect(safeMimeType('')).toBe('application/octet-stream')
  })
})
