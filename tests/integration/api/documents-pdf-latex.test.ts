import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as docsQ from '@/lib/db/queries/documents'
import { makeUser } from '@/tests/factories'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))
const compileMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/latex/compile', async (orig) => ({
  ...(await orig<typeof import('@/lib/latex/compile')>()),
  compileLatex: compileMock,
}))

const PDF = new Uint8Array([37, 80, 68, 70, 45])

async function importRoute() {
  return import('@/app/api/documents/[id]/pdf/route')
}

async function seed(content: Record<string, unknown> = { source: '\\documentclass{article}' }) {
  const u = await makeUser()
  const doc = await docsQ.create(u.id, {
    applicationId: null,
    kind: 'latex_cv',
    version: 1,
    title: 'My CV',
    content,
  })
  authMock.mockResolvedValue({ user: { id: u.id } })
  return { u, doc }
}

function get(id: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/documents/${id}/pdf`, { headers })
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  authMock.mockReset()
  compileMock.mockReset()
  compileMock.mockResolvedValue({ ok: true, pdf: PDF.slice().buffer })
})

describe('GET /api/documents/[id]/pdf (LaTeX)', () => {
  it('compiles once, serves repeat views from the cache, and never rewrites the document', async () => {
    const { u, doc } = await seed()
    const { GET } = await importRoute()

    const r1 = await GET(get(doc.id), ctx(doc.id))
    expect(r1.status).toBe(200)
    expect(r1.headers.get('cache-control')).toMatch(/^private/)
    const etag = r1.headers.get('etag')
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/)
    expect([...new Uint8Array(await r1.arrayBuffer())]).toEqual([...PDF])

    const r2 = await GET(get(doc.id), ctx(doc.id))
    expect(r2.status).toBe(200)
    expect([...new Uint8Array(await r2.arrayBuffer())]).toEqual([...PDF])
    expect(compileMock).toHaveBeenCalledTimes(1)

    const after = await docsQ.getById(u.id, doc.id)
    expect(after!.updatedAt.getTime()).toBe(doc.updatedAt.getTime())
    expect(after!.content).toEqual(doc.content)
  })

  it('answers a matching If-None-Match with 304 and no compile', async () => {
    const { doc } = await seed()
    const { GET } = await importRoute()
    const etag = (await GET(get(doc.id), ctx(doc.id))).headers.get('etag')!
    compileMock.mockClear()
    const r = await GET(get(doc.id, { 'if-none-match': etag }), ctx(doc.id))
    expect(r.status).toBe(304)
    expect(r.headers.get('etag')).toBe(etag)
    expect(r.headers.get('cache-control')).toMatch(/^private/)
    expect(compileMock).not.toHaveBeenCalled()
  })

  it('records a compile error once and clears it after a successful compile', async () => {
    const { u, doc } = await seed()
    const { GET } = await importRoute()
    compileMock.mockResolvedValue({ ok: false, status: 400, log: 'Undefined control sequence' })

    expect((await GET(get(doc.id), ctx(doc.id))).status).toBe(422)
    const failed = await docsQ.getById(u.id, doc.id)
    expect(failed!.content).toMatchObject({ compileError: 'Compile failed (status 400)' })

    // Same failure again: no second write.
    expect((await GET(get(doc.id), ctx(doc.id))).status).toBe(422)
    const again = await docsQ.getById(u.id, doc.id)
    expect(again!.updatedAt.getTime()).toBe(failed!.updatedAt.getTime())

    compileMock.mockResolvedValue({ ok: true, pdf: PDF.slice().buffer })
    expect((await GET(get(doc.id), ctx(doc.id))).status).toBe(200)
    const fixed = await docsQ.getById(u.id, doc.id)
    expect(fixed!.content).not.toHaveProperty('compileError')
    expect(fixed!.content).not.toHaveProperty('compileLog')
  })

  it('404s for another user without compiling', async () => {
    const { doc } = await seed()
    const other = await makeUser()
    authMock.mockResolvedValue({ user: { id: other.id } })
    const { GET } = await importRoute()
    expect((await GET(get(doc.id), ctx(doc.id))).status).toBe(404)
    expect(compileMock).not.toHaveBeenCalled()
  })
})
