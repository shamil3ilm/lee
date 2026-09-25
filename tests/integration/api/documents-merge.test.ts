import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as docsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { makeUser } from '@/tests/factories'

// Merge route drives real DB writes; auth is stubbed so we can flip users.
const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

async function importRoutes() {
  const merge = await import('@/app/api/documents/merge/route')
  const pdf = await import('@/app/api/documents/[id]/pdf/route')
  return { merge, pdf }
}

async function makePdfBytes(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const line of lines) {
    const page = doc.addPage([300, 200])
    page.drawText(line, { x: 40, y: 120, size: 14, font })
  }
  return Buffer.from(await doc.save())
}

async function seedPdfAsset(userId: string, docId: string, filename: string, lines: string[]) {
  const bytes = await makePdfBytes(lines)
  return assetsQ.create(userId, docId, {
    filename,
    mimeType: 'application/pdf',
    sizeBytes: bytes.byteLength,
    bytes,
  })
}

beforeEach(() => {
  authMock.mockReset()
})

describe('POST /api/documents/merge', () => {
  it('rejects unauthenticated requests', async () => {
    authMock.mockResolvedValue(null)
    const { merge } = await importRoutes()
    const res = await merge.POST(
      new Request('http://localhost/api/documents/merge', {
        method: 'POST',
        body: JSON.stringify({ sources: [] }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('rejects an empty source list with 400', async () => {
    const u = await makeUser('merge-empty@x.com')
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { merge } = await importRoutes()
    const res = await merge.POST(
      new Request('http://localhost/api/documents/merge', {
        method: 'POST',
        body: JSON.stringify({ sources: [] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('creates a merged_pdf document row from asset sources', async () => {
    const u = await makeUser('merge-ok@x.com')
    // Two host documents (kind irrelevant — we only use their assets).
    const hostA = await docsQ.create(u.id, {
      applicationId: null,
      kind: 'latex_cv',
      version: 1,
      title: 'host A',
      content: { source: '\\documentclass{article}\\begin{document}x\\end{document}' },
    })
    const hostB = await docsQ.create(u.id, {
      applicationId: null,
      kind: 'latex_cv',
      version: 1,
      title: 'host B',
      content: { source: '\\documentclass{article}\\begin{document}y\\end{document}' },
    })
    const a1 = await seedPdfAsset(u.id, hostA.id, 'a.pdf', ['A1', 'A2'])
    const b1 = await seedPdfAsset(u.id, hostB.id, 'b.pdf', ['B1'])

    authMock.mockResolvedValue({ user: { id: u.id } })
    const { merge } = await importRoutes()
    const res = await merge.POST(
      new Request('http://localhost/api/documents/merge', {
        method: 'POST',
        body: JSON.stringify({
          sources: [
            { kind: 'asset', id: a1.id },
            { kind: 'asset', id: b1.id },
          ],
          title: 'Package v1',
        }),
      }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { documentId: string; downloadUrl: string }
    expect(body.documentId).toMatch(/[0-9a-f-]{36}/)
    expect(body.downloadUrl).toBe(`/api/documents/${body.documentId}/pdf`)

    const stored = await docsQ.getById(u.id, body.documentId)
    expect(stored?.kind).toBe('merged_pdf')
    expect(stored?.title).toBe('Package v1')
    const content = stored?.content as { sourceRefs: Array<{ kind: string; id: string }> }
    expect(content.sourceRefs).toHaveLength(2)
  })

  it('returns 422 when a source id is unknown', async () => {
    const u = await makeUser('merge-badid@x.com')
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { merge } = await importRoutes()
    const res = await merge.POST(
      new Request('http://localhost/api/documents/merge', {
        method: 'POST',
        body: JSON.stringify({
          sources: [
            { kind: 'asset', id: '00000000-0000-0000-0000-000000000000' },
          ],
        }),
      }),
    )
    expect(res.status).toBe(422)
  })
})

describe('GET /api/documents/[id]/pdf for merged_pdf', () => {
  it('regenerates and streams the merged PDF on download', async () => {
    const u = await makeUser('merge-download@x.com')
    const host = await docsQ.create(u.id, {
      applicationId: null,
      kind: 'latex_cv',
      version: 1,
      title: 'host',
      content: { source: '\\documentclass{article}\\begin{document}x\\end{document}' },
    })
    const a = await seedPdfAsset(u.id, host.id, 'a.pdf', ['first'])
    const b = await seedPdfAsset(u.id, host.id, 'b.pdf', ['second'])
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { merge, pdf } = await importRoutes()
    const created = await merge.POST(
      new Request('http://localhost/api/documents/merge', {
        method: 'POST',
        body: JSON.stringify({
          sources: [
            { kind: 'asset', id: a.id },
            { kind: 'asset', id: b.id },
          ],
        }),
      }),
    )
    expect(created.status).toBe(201)
    const { documentId } = (await created.json()) as { documentId: string }
    const res = await pdf.GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: documentId }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.length).toBeGreaterThan(200)
    // Verify the merged PDF has two pages.
    const merged = await PDFDocument.load(bytes)
    expect(merged.getPageCount()).toBe(2)
  })
})
