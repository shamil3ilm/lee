import { describe, it, expect, vi } from 'vitest'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as docsQ from '@/lib/db/queries/documents'
import { getAssetStore, MAX_PDF_CACHE_BYTES } from '@/lib/storage/asset-store'
import { compileDocumentPdf, latexCacheKey } from '@/lib/latex/pdf-cache'
import type { CompileOptions, CompileResult } from '@/lib/latex/compile'
import { withDraftMode } from '@/lib/latex/draft'
import { makeUser } from '@/tests/factories'

async function seedDoc() {
  const u = await makeUser()
  const doc = await docsQ.create(u.id, {
    applicationId: null,
    kind: 'latex_cv',
    version: 1,
    title: 'CV',
    content: { source: 'src' },
  })
  return { u, doc }
}

function fakeCompiler(pdf: Uint8Array = new Uint8Array([37, 80, 68, 70])) {
  return vi.fn(
    async (_input: CompileOptions): Promise<CompileResult> => ({
      ok: true,
      pdf: pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer,
    }),
  )
}

describe('latexCacheKey', () => {
  it('is stable for the same inputs regardless of asset order and changes with any input', () => {
    const a = { filename: 'a.png', sha256: '11' }
    const b = { filename: 'b.png', sha256: '22' }
    const k = latexCacheKey('src', [a, b])
    expect(k).toMatch(/^[0-9a-f]{64}$/)
    expect(latexCacheKey('src', [b, a])).toBe(k)
    expect(latexCacheKey('src2', [a, b])).not.toBe(k)
    expect(latexCacheKey('src', [a, { ...b, sha256: '23' }])).not.toBe(k)
    expect(latexCacheKey('src', [a, { ...b, filename: 'c.png' }])).not.toBe(k)
  })
})

describe('compileDocumentPdf', () => {
  it('compiles once, then serves the cached PDF until the source or an asset changes', async () => {
    const { u, doc } = await seedDoc()
    const store = getAssetStore()
    const compile = fakeCompiler()

    const first = await compileDocumentPdf({ userId: u.id, documentId: doc.id, source: 'src', compile })
    expect(first).toMatchObject({ ok: true, cached: false })
    const second = await compileDocumentPdf({ userId: u.id, documentId: doc.id, source: 'src', compile })
    expect(second).toMatchObject({ ok: true, cached: true, cacheKey: first.cacheKey })
    expect(compile).toHaveBeenCalledTimes(1)
    if (second.ok) expect([...second.pdf]).toEqual([37, 80, 68, 70])

    // Adding an asset invalidates, and the asset bytes are bundled.
    await store.put(u.id, { kind: 'document-asset', documentId: doc.id, filename: 'p.png' }, Buffer.from([9]), {
      mimeType: 'image/png',
    })
    const third = await compileDocumentPdf({ userId: u.id, documentId: doc.id, source: 'src', compile })
    expect(third).toMatchObject({ ok: true, cached: false })
    expect(compile).toHaveBeenCalledTimes(2)
    expect(compile.mock.calls[1]![0].assets).toEqual([
      { filename: 'p.png', mimeType: 'image/png', bytes: Buffer.from([9]) },
    ])

    // Source change invalidates too; still one cache row for the document.
    await compileDocumentPdf({ userId: u.id, documentId: doc.id, source: 'src v2', compile })
    expect(compile).toHaveBeenCalledTimes(3)
    expect(await db.select().from(s.documentPdfCache)).toHaveLength(1)
  })

  it('does not cache failed compiles or oversized PDFs', async () => {
    const { u, doc } = await seedDoc()
    const failing = vi.fn(async (): Promise<CompileResult> => ({ ok: false, status: 400, log: 'bad' }))
    const res = await compileDocumentPdf({ userId: u.id, documentId: doc.id, source: 'x', compile: failing })
    expect(res).toMatchObject({ ok: false, status: 400, log: 'bad' })

    const huge = fakeCompiler(new Uint8Array(MAX_PDF_CACHE_BYTES + 1))
    const big = await compileDocumentPdf({ userId: u.id, documentId: doc.id, source: 'x', compile: huge })
    expect(big).toMatchObject({ ok: true, cached: false })
    expect(await db.select().from(s.documentPdfCache)).toHaveLength(0)
  })

  it('draft mode compiles the draft source and never replaces the cached final PDF', async () => {
    const { u, doc } = await seedDoc()
    const compile = fakeCompiler()
    const final = await compileDocumentPdf({ userId: u.id, documentId: doc.id, source: 'src', compile })

    const draft = await compileDocumentPdf({
      userId: u.id,
      documentId: doc.id,
      source: 'src',
      draft: true,
      compile,
    })
    expect(draft).toMatchObject({ ok: true, cached: false })
    expect(draft.cacheKey).not.toBe(final.cacheKey)
    expect(compile.mock.calls[1]![0].source).toBe(withDraftMode('src'))

    // The final PDF is still served from the cache.
    const again = await compileDocumentPdf({ userId: u.id, documentId: doc.id, source: 'src', compile })
    expect(again).toMatchObject({ ok: true, cached: true, cacheKey: final.cacheKey })
    expect(compile).toHaveBeenCalledTimes(2)
  })
})
