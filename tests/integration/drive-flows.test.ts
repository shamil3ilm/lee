import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as docsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import * as cvScoresQ from '@/lib/db/queries/cvScores'
import { DriveError } from '@/lib/drive/errors'
import { DRIVE_FILE_SCOPE } from '@/lib/drive/scope'
import { migrateAssetsToDrive } from '@/lib/drive/migrate'
import { attachPickedFile, completeAssetUpload, createAssetUploadSession, findStrandedUpload } from '@/lib/drive/uploads'
import { saveCvCopyToDrive } from '@/lib/drive/cv-copy'
import { mintScopedAccessToken } from '@/lib/google/tokens'
import { getAssetStoreForUser } from '@/lib/storage/asset-store'
import { PostgresAssetStore } from '@/lib/storage/postgres-asset-store'
import { makeUser } from '@/tests/factories'
import { FakeDrive } from '@/tests/fixtures/fake-drive'
import { driveUser } from '@/tests/fixtures/drive-user'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock, signIn: vi.fn() }))

const originalFetch = globalThis.fetch
let drive: FakeDrive

beforeEach(() => {
  drive = new FakeDrive()
  globalThis.fetch = drive.fetch as unknown as typeof fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
  authMock.mockReset()
})

async function makeDoc(userId: string, title = 'CV') {
  return docsQ.create(userId, { applicationId: null, kind: 'latex_cv', version: 1, title, content: { source: 'x' } })
}

/** Legacy Postgres-held assets (what existing users have before migrating). */
async function pgAssets(userId: string, documentId: string, n: number) {
  const pg = new PostgresAssetStore()
  const out = []
  for (let i = 0; i < n; i++) {
    const put = await pg.put(
      userId,
      { kind: 'document-asset', documentId, filename: `f${i}.png` },
      Buffer.alloc(10 + i, i + 1),
      { mimeType: 'image/png' },
    )
    out.push(put.asset!)
  }
  return out
}

async function rowsOf(userId: string) {
  return db.select().from(s.documentAssets).where(eq(s.documentAssets.userId, userId))
}

describe('browser-direct resumable upload', () => {
  it('opens a session server-side, the browser PUTs, complete verifies and records', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const session = await createAssetUploadSession({
      userId: u.id,
      documentId: doc.id,
      filename: 'my photo.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      origin: 'http://localhost:3000',
    })
    expect(session.filename).toBe('my_photo.png')
    expect(session.uploadUrl).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=resumable/)
    expect(drive.sessions.get(session.uploadUrl)!.origin).toBe('http://localhost:3000')

    // The browser's PUT carries no Authorization header: the URI authorises it.
    const put = await fetch(session.uploadUrl, { method: 'PUT', body: new Uint8Array(Buffer.alloc(12, 9)) })
    const uploaded = (await put.json()) as { id: string }

    const asset = await completeAssetUpload({ userId: u.id, documentId: doc.id, fileId: uploaded.id })
    expect(asset).toMatchObject({ filename: 'my_photo.png', sizeBytes: 12, driveFileId: uploaded.id })
    // Idempotent: completing twice returns the same row.
    const again = await completeAssetUpload({ userId: u.id, documentId: doc.id, fileId: uploaded.id })
    expect(again.id).toBe(asset.id)
    const [row] = await rowsOf(u.id)
    expect(row!.bytes).toBeNull()
    expect(row!.sha256).toBe(assetsQ.sha256Hex(Buffer.alloc(12, 9)))
  })

  it('refuses to register a file that is not an Employ upload for this document', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const other = await makeDoc(u.id, 'Other')
    const own = drive.seed(`tok-${u.id}`, { name: 'x.png', bytes: Buffer.alloc(3) })
    await expect(completeAssetUpload({ userId: u.id, documentId: doc.id, fileId: own.id })).rejects.toMatchObject({
      code: 'verify_failed',
    })
    const session = await createAssetUploadSession({
      userId: u.id,
      documentId: other.id,
      filename: 'y.png',
      mimeType: 'image/png',
      sizeBytes: 3,
    })
    const up = (await (await fetch(session.uploadUrl, { method: 'PUT', body: new Uint8Array(3) })).json()) as { id: string }
    await expect(completeAssetUpload({ userId: u.id, documentId: doc.id, fileId: up.id })).rejects.toBeInstanceOf(DriveError)
    // Another user cannot claim it either (drive.file: not visible to them).
    const b = await driveUser()
    const docB = await makeDoc(b.id)
    await expect(completeAssetUpload({ userId: b.id, documentId: docB.id, fileId: up.id })).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(await rowsOf(b.id)).toHaveLength(0)
  })

  it('adopts a PUT that landed in Drive when the browser fell back to the server path', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const session = await createAssetUploadSession({
      userId: u.id,
      documentId: doc.id,
      filename: 'z.png',
      mimeType: 'image/png',
      sizeBytes: 5,
    })
    await fetch(session.uploadUrl, { method: 'PUT', body: new Uint8Array(5) })
    const uploadsBefore = drive.uploads()
    const adopted = await findStrandedUpload(u.id, doc.id, session.uploadId, 5)
    expect(adopted?.filename).toBe('z.png')
    expect(drive.uploads()).toBe(uploadsBefore)
    expect(await findStrandedUpload(u.id, doc.id, 'no-such-upload', 5)).toBeNull()
  })

  it('upload-session route answers server mode for users without Drive (e2e test user)', async () => {
    const u = await makeUser()
    const doc = await makeDoc(u.id)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await import('@/app/api/documents/[id]/assets/upload-session/route')
    const res = await POST(
      new Request(`http://localhost:3000/api/documents/${doc.id}/assets/upload-session`, {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ filename: 'a.png', mimeType: 'image/png', size: 10 }),
      }),
      { params: Promise.resolve({ id: doc.id }) },
    )
    expect(await res.json()).toEqual({ mode: 'server' })
    expect(drive.calls).toHaveLength(0)

    const { GET } = await import('@/app/api/drive/status/route')
    const status = await (await GET()).json()
    expect(status).toEqual({ hasGoogleAccount: false, connected: false, enabled: true, backend: 'postgres' })
  })

  it('asset GET route streams from Drive and answers a revoked grant with a friendly 409', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const store = await getAssetStoreForUser(u.id)
    await store.put(u.id, { kind: 'document-asset', documentId: doc.id, filename: 'a.png' }, Buffer.alloc(8, 4), {
      mimeType: 'image/png',
    })
    const { GET } = await import('@/app/api/documents/[id]/assets/[filename]/route')
    const ctx = { params: Promise.resolve({ id: doc.id, filename: 'a.png' }) }
    const ok = await GET(new Request('http://localhost/x'), ctx)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await ok.arrayBuffer())).toEqual(Buffer.alloc(8, 4))

    drive.revoked = true
    const res = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: doc.id, filename: 'a.png' }) })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string; connect?: boolean }
    expect(body.error).toMatch(/Reconnect Google Drive/)
    expect(body.connect).toBe(true)
    expect(JSON.stringify(body)).not.toMatch(/authError|googleapis/)
  })
})

describe('Google Picker attach', () => {
  it('references the picked file in place and never trashes it on removal', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const picked = drive.seed(`tok-${u.id}`, { name: 'certificate.pdf', mimeType: 'application/pdf', bytes: Buffer.alloc(7, 2) })
    const asset = await attachPickedFile({ userId: u.id, documentId: doc.id, fileId: picked.id })
    expect(asset).toMatchObject({ filename: 'certificate.pdf', drivePicked: true, driveFileId: picked.id })
    const store = await getAssetStoreForUser(u.id)
    expect(await store.get(u.id, store.refForDocumentAsset(asset))).toEqual(Buffer.alloc(7, 2))
    expect(await store.delete(u.id, store.refForDocumentAsset(asset))).toBe(true)
    expect(drive.files.get(picked.id)!.trashed).toBe(false)
  })

  it('rejects Google-native docs and oversized files with friendly errors', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const gdoc = drive.seed(`tok-${u.id}`, {
      name: 'CV',
      mimeType: 'application/vnd.google-apps.document',
      bytes: Buffer.alloc(0),
    })
    await expect(attachPickedFile({ userId: u.id, documentId: doc.id, fileId: gdoc.id })).rejects.toMatchObject({
      code: 'unsupported',
    })
    const big = drive.seed(`tok-${u.id}`, { name: 'big.pdf', mimeType: 'application/pdf', bytes: Buffer.alloc(assetsQ.MAX_ASSET_BYTES + 1) })
    await expect(attachPickedFile({ userId: u.id, documentId: doc.id, fileId: big.id })).rejects.toMatchObject({
      code: 'file_too_large',
    })
  })

  it('hashes by download when Drive has no checksum', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    drive.omitSha = true
    const f = drive.seed(`tok-${u.id}`, { name: 'p.png', mimeType: 'image/png', bytes: Buffer.alloc(4, 5) })
    await attachPickedFile({ userId: u.id, documentId: doc.id, fileId: f.id })
    const [row] = await rowsOf(u.id)
    expect(row!.sha256).toBe(assetsQ.sha256Hex(Buffer.alloc(4, 5)))
  })

  it('mints a drive.file-only token for the Picker, refusing a broader one', async () => {
    const u = await driveUser()
    const tok = await mintScopedAccessToken(u.id, DRIVE_FILE_SCOPE)
    expect(tok).toEqual({ accessToken: 'scoped-token', expiresIn: 3599 })
    expect(drive.tokenRequests[0]!.get('scope')).toBe(DRIVE_FILE_SCOPE)
    expect(drive.tokenRequests[0]!.get('grant_type')).toBe('refresh_token')
    drive.tokenResponse = {
      status: 200,
      body: { access_token: 'wide', expires_in: 3599, scope: `${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/gmail.readonly` },
    }
    await expect(mintScopedAccessToken(u.id, DRIVE_FILE_SCOPE)).rejects.toThrow(/unexpected scope/)
  })

  it('picker-token route: not connected → friendly connect error, no token call', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { GET } = await import('@/app/api/drive/picker-token/route')
    const res = await GET()
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'not_connected', connect: true })
    expect(drive.tokenRequests).toHaveLength(0)
  })
})

describe('moving existing files to Drive', () => {
  it('copies, verifies the hash, then clears bytea; re-runs are no-ops', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const legacy = await pgAssets(u.id, doc.id, 3)
    const r1 = await migrateAssetsToDrive(u.id)
    expect(r1).toEqual({ migrated: 3, failed: 0, remaining: 0, error: undefined })
    const rows = await rowsOf(u.id)
    for (const row of rows) {
      expect(row.bytes).toBeNull()
      expect(row.driveFileId).toMatch(/^drv_/)
      expect(drive.files.get(row.driveFileId!)!.appProperties.employAssetId).toBe(row.id)
    }
    // Content survives the move and reads through the normal store.
    const store = await getAssetStoreForUser(u.id)
    const first = legacy[0]!
    const meta = await assetsQ.getMetaById(u.id, first.id)
    expect(await store.get(u.id, store.refForDocumentAsset(meta!))).toEqual(Buffer.alloc(10, 1))

    const uploads = drive.uploads()
    expect(await migrateAssetsToDrive(u.id)).toEqual({ migrated: 0, failed: 0, remaining: 0, error: undefined })
    expect(drive.uploads()).toBe(uploads)
  })

  it('resumes after an outage without re-uploading or losing bytes', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    await pgAssets(u.id, doc.id, 3)
    drive.uploadsBeforeOutage = 1
    const r1 = await migrateAssetsToDrive(u.id)
    expect(r1.migrated).toBe(1)
    expect(r1.remaining).toBe(2)
    expect(r1.error?.code).toBe('unavailable')
    const held = (await rowsOf(u.id)).filter((r) => r.bytes !== null)
    expect(held).toHaveLength(2)

    drive.uploadsBeforeOutage = -1
    const r2 = await migrateAssetsToDrive(u.id)
    expect(r2).toMatchObject({ migrated: 2, remaining: 0 })
    // Exactly one Drive copy per asset.
    expect(drive.count((f) => !!f.appProperties.employAssetId && !f.trashed)).toBe(3)
  })

  it('reuses a copy uploaded before a crash (tagged by asset id) instead of uploading twice', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    const [a] = await pgAssets(u.id, doc.id, 1)
    // Simulate: the upload finished, then the process died before the DB update.
    const orphan = drive.seed(`tok-${u.id}`, {
      name: a!.filename,
      mimeType: 'image/png',
      bytes: Buffer.alloc(10, 1),
      appProperties: { employAssetId: a!.id },
    })
    const uploads = drive.uploads()
    expect((await migrateAssetsToDrive(u.id)).migrated).toBe(1)
    expect(drive.uploads()).toBe(uploads)
    expect((await assetsQ.getMetaById(u.id, a!.id))!.driveFileId).toBe(orphan.id)
  })

  it('never clears the only copy when Drive reports a different hash', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    await pgAssets(u.id, doc.id, 1)
    drive.corruptSha = true
    const r = await migrateAssetsToDrive(u.id)
    expect(r).toMatchObject({ migrated: 0, failed: 1, remaining: 1 })
    const [row] = await rowsOf(u.id)
    expect(row!.bytes).not.toBeNull()
    expect(row!.driveFileId).toBeNull()
    expect(drive.count((f) => f.mimeType === 'image/png' && !f.trashed)).toBe(0)
  })

  it('stops with reconnect on a revoked grant and reports not-connected users', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    await pgAssets(u.id, doc.id, 2)
    drive.revoked = true
    const r = await migrateAssetsToDrive(u.id)
    expect(r).toMatchObject({ migrated: 0, remaining: 2, error: { code: 'reconnect' } })

    const plain = await makeUser()
    const r2 = await migrateAssetsToDrive(plain.id)
    expect(r2.error?.code).toBe('not_connected')
  })

  it("only ever touches the calling user's rows", async () => {
    const a = await driveUser()
    const b = await driveUser()
    await pgAssets(a.id, (await makeDoc(a.id)).id, 1)
    await pgAssets(b.id, (await makeDoc(b.id)).id, 1)
    await migrateAssetsToDrive(a.id)
    expect((await rowsOf(b.id))[0]!.bytes).not.toBeNull()
  })

  it('respects the per-call file budget (resumable batches)', async () => {
    const u = await driveUser()
    const doc = await makeDoc(u.id)
    await pgAssets(u.id, doc.id, 3)
    expect(await migrateAssetsToDrive(u.id, { maxFiles: 2 })).toMatchObject({ migrated: 2, remaining: 1 })
    expect(await migrateAssetsToDrive(u.id, { maxFiles: 2 })).toMatchObject({ migrated: 1, remaining: 0 })
  })
})

describe('CV score: save a copy to Drive', () => {
  async function scoreRow(userId: string) {
    return cvScoresQ.create(userId, {
      documentId: null,
      applicationId: null,
      sourceKind: 'upload',
      sourceLabel: 'cv.pdf',
      overall: 70,
      grade: 'B',
      mode: 'general',
      scores: {},
      dimensions: [],
      findings: [],
      meta: {},
      scorerVersion: 't',
    })
  }

  it('saves into Employ/CVs and links the cv_scores row', async () => {
    const u = await driveUser()
    const row = await scoreRow(u.id)
    const res = await saveCvCopyToDrive({
      userId: u.id,
      scoreId: row.id,
      name: 'cv.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array(Buffer.alloc(6, 1)),
      now: new Date('2026-09-26T10:00:00Z'),
    })
    expect(res.saved).toBe(true)
    const file = drive.files.get((res as { driveFileId: string }).driveFileId)!
    expect(file.name).toBe('2026-09-26 cv.pdf')
    const cvs = [...drive.files.values()].find((f) => f.name === 'CVs')!
    expect(file.parents).toEqual([cvs.id])
    expect((await cvScoresQ.getById(u.id, row.id))!.driveFileId).toBe(file.id)
  })

  it('reports "connect" without throwing when Drive is not connected', async () => {
    const u = await makeUser()
    const row = await scoreRow(u.id)
    const res = await saveCvCopyToDrive({ userId: u.id, scoreId: row.id, name: 'cv.pdf', mimeType: 'application/pdf', bytes: new Uint8Array(3) })
    expect(res).toMatchObject({ saved: false, connect: true })
    expect((await cvScoresQ.getById(u.id, row.id))!.driveFileId).toBeNull()
    expect(drive.calls).toHaveLength(0)
  })
})
