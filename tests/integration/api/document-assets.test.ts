import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as docsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { makeUser } from '@/tests/factories'

// The route handlers call `auth()`; we stub it per test to return a session
// for the current user so the API path exercises real DB writes end-to-end.
const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

// Import routes AFTER the mock is registered.
async function importRoutes() {
  const list = await import('@/app/api/documents/[id]/assets/route')
  const single = await import('@/app/api/documents/[id]/assets/[filename]/route')
  return { list, single }
}

function makeMultipart(files: { name: string; type: string; body: Uint8Array }[]): FormData {
  const form = new FormData()
  for (const f of files) {
    form.append('file', new Blob([f.body], { type: f.type }), f.name)
  }
  return form
}

function buildRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, init)
}

async function seedDoc() {
  const u = await makeUser(`assets-api-${Math.random()}@x.com`)
  const doc = await docsQ.create(u.id, {
    applicationId: null,
    kind: 'latex_cv',
    version: 1,
    title: 'CV',
    content: { source: '\\documentclass{article}\\begin{document}x\\end{document}' },
  })
  return { u, doc }
}

beforeEach(() => {
  authMock.mockReset()
})

describe('POST /api/documents/[id]/assets', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null)
    const { list } = await importRoutes()
    const res = await list.POST(
      buildRequest('http://localhost/api/documents/x/assets', { method: 'POST' }),
      { params: Promise.resolve({ id: 'x' }) },
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 for a document the user does not own', async () => {
    const { u, doc } = await seedDoc()
    const other = await makeUser('other-post-assets@x.com')
    authMock.mockResolvedValue({ user: { id: other.id } })
    const { list } = await importRoutes()
    const form = makeMultipart([{ name: 'a.jpg', type: 'image/jpeg', body: new Uint8Array([1]) }])
    const res = await list.POST(
      new Request(`http://localhost/api/documents/${doc.id}/assets`, {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ id: doc.id }) },
    )
    expect(res.status).toBe(404)
    void u
  })

  it('uploads multiple files in one request', async () => {
    const { u, doc } = await seedDoc()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { list } = await importRoutes()
    const form = makeMultipart([
      { name: 'a.jpg', type: 'image/jpeg', body: new Uint8Array([1, 2]) },
      { name: 'b.png', type: 'image/png', body: new Uint8Array([3, 4]) },
    ])
    const res = await list.POST(
      new Request(`http://localhost/api/documents/${doc.id}/assets`, {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ id: doc.id }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { assets: assetsQ.AssetMetadata[]; errors?: unknown[] }
    expect(body.assets).toHaveLength(2)
    expect(body.assets.map((a) => a.filename).sort()).toEqual(['a.jpg', 'b.png'])
    expect(body.errors).toBeUndefined()
  })

  it('partial success — reports errors alongside inserted files', async () => {
    const { u, doc } = await seedDoc()
    authMock.mockResolvedValue({ user: { id: u.id } })
    // Pre-seed a conflicting filename so the second upload fails.
    await assetsQ.create(u.id, doc.id, {
      filename: 'dup.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      bytes: Buffer.from([9]),
    })
    const { list } = await importRoutes()
    const form = makeMultipart([
      { name: 'ok.jpg', type: 'image/jpeg', body: new Uint8Array([1]) },
      { name: 'dup.jpg', type: 'image/jpeg', body: new Uint8Array([2]) },
    ])
    const res = await list.POST(
      new Request(`http://localhost/api/documents/${doc.id}/assets`, {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ id: doc.id }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      assets: assetsQ.AssetMetadata[]
      errors?: { filename: string; error: string }[]
    }
    expect(body.assets.map((a) => a.filename)).toEqual(['ok.jpg'])
    expect(body.errors?.[0]?.filename).toBe('dup.jpg')
  })

  it('returns 400 when no file field is present', async () => {
    const { u, doc } = await seedDoc()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { list } = await importRoutes()
    const form = new FormData()
    const res = await list.POST(
      new Request(`http://localhost/api/documents/${doc.id}/assets`, {
        method: 'POST',
        body: form,
      }),
      { params: Promise.resolve({ id: doc.id }) },
    )
    expect(res.status).toBe(400)
  })
})

describe('GET /api/documents/[id]/assets', () => {
  it('lists metadata without bytes', async () => {
    const { u, doc } = await seedDoc()
    await assetsQ.create(u.id, doc.id, {
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
      bytes: Buffer.from([1, 2, 3]),
    })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { list } = await importRoutes()
    const res = await list.GET(
      buildRequest(`http://localhost/api/documents/${doc.id}/assets`),
      { params: Promise.resolve({ id: doc.id }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { assets: assetsQ.AssetMetadata[] }
    expect(body.assets).toHaveLength(1)
    expect(body.assets[0]).not.toHaveProperty('bytes')
  })
})

describe('GET /api/documents/[id]/assets/[filename]', () => {
  it('serves raw bytes with the stored MIME type', async () => {
    const { u, doc } = await seedDoc()
    await assetsQ.create(u.id, doc.id, {
      filename: 'x.png',
      mimeType: 'image/png',
      sizeBytes: 4,
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { single } = await importRoutes()
    const res = await single.GET(
      buildRequest(`http://localhost/api/documents/${doc.id}/assets/x.png`),
      { params: Promise.resolve({ id: doc.id, filename: 'x.png' }) },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('max-age=3600')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('rejects filenames containing traversal characters', async () => {
    const { u, doc } = await seedDoc()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { single } = await importRoutes()
    const res = await single.GET(
      buildRequest(`http://localhost/api/documents/${doc.id}/assets/..%2Fetc`),
      { params: Promise.resolve({ id: doc.id, filename: '..%2Fetc' }) },
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/documents/[id]/assets/[filename]', () => {
  it('removes the asset', async () => {
    const { u, doc } = await seedDoc()
    await assetsQ.create(u.id, doc.id, {
      filename: 'del.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      bytes: Buffer.from([1]),
    })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { single } = await importRoutes()
    const res = await single.DELETE(
      buildRequest(`http://localhost/api/documents/${doc.id}/assets/del.jpg`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: doc.id, filename: 'del.jpg' }) },
    )
    expect(res.status).toBe(200)
    expect(await assetsQ.get(u.id, doc.id, 'del.jpg')).toBeNull()
  })

  it('returns 404 when the asset does not exist', async () => {
    const { u, doc } = await seedDoc()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { single } = await importRoutes()
    const res = await single.DELETE(
      buildRequest(`http://localhost/api/documents/${doc.id}/assets/missing.jpg`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: doc.id, filename: 'missing.jpg' }) },
    )
    expect(res.status).toBe(404)
  })
})
