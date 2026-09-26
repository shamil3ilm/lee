import { describe, it, expect, vi } from 'vitest'
import * as docsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { makeUser } from '@/tests/factories'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))
// Shrink the per-user quota so the test can cross it with a few bytes.
vi.mock('@/lib/storage/asset-store', async (orig) => {
  const actual = await orig<typeof import('@/lib/storage/asset-store')>()
  const { PostgresAssetStore } = await import('@/lib/storage/postgres-asset-store')
  const small = new PostgresAssetStore({ quotaBytes: 8 })
  return { ...actual, getAssetStore: () => small }
})

function upload(docId: string, files: { name: string; size: number }[]): Request {
  const form = new FormData()
  for (const f of files) {
    form.append('file', new Blob([new Uint8Array(f.size).fill(1)], { type: 'image/png' }), f.name)
  }
  return new Request(`http://localhost/api/documents/${docId}/assets`, { method: 'POST', body: form })
}

describe('POST /api/documents/[id]/assets — storage quota', () => {
  it('stores files until the quota and returns a friendly per-file error past it', async () => {
    const u = await makeUser()
    const doc = await docsQ.create(u.id, {
      applicationId: null,
      kind: 'latex_cv',
      version: 1,
      title: 'CV',
      content: { source: 'x' },
    })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await import('@/app/api/documents/[id]/assets/route')

    const res = await POST(
      upload(doc.id, [
        { name: 'a.png', size: 5 },
        { name: 'b.png', size: 5 },
      ]),
      { params: Promise.resolve({ id: doc.id }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      assets: assetsQ.AssetMetadata[]
      errors?: { filename: string; error: string }[]
    }
    expect(body.assets.map((a) => a.filename)).toEqual(['a.png'])
    expect(body.errors).toHaveLength(1)
    expect(body.errors![0]!.filename).toBe('b.png')
    expect(body.errors![0]!.error).toMatch(/storage limit/i)
    expect(await assetsQ.list(u.id, doc.id)).toHaveLength(1)
  })
})
