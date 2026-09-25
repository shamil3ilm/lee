import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// Note on scope: the full `mergePdfs` service dispatches into the LaTeX
// compile service and React-PDF renderer, both of which are heavy for a
// pure-unit test. Here we exercise the pdf-lib primitives the service is
// built on (load + copyPages + save) against hand-crafted fixtures so any
// regression in the underlying merge pipeline is caught quickly. The
// integration surface (document dispatcher, asset wrapping) is covered by
// the higher-level API-route tests.

async function makePdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const line of lines) {
    const page = doc.addPage([300, 200])
    page.drawText(line, { x: 40, y: 120, size: 14, font })
  }
  const bytes = await doc.save()
  return Buffer.from(bytes)
}

async function mergeBuffers(bufs: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create()
  for (const b of bufs) {
    const src = await PDFDocument.load(b, { updateMetadata: false })
    const copied = await merged.copyPages(src, src.getPageIndices())
    for (const p of copied) merged.addPage(p)
  }
  const bytes = await merged.save()
  return Buffer.from(bytes)
}

describe('pdf-lib merge primitives', () => {
  it('concatenates page counts across sources', async () => {
    const a = await makePdf(['A1', 'A2'])
    const b = await makePdf(['B1'])
    const merged = await mergeBuffers([a, b])
    const parsed = await PDFDocument.load(merged)
    expect(parsed.getPageCount()).toBe(3)
  })

  it('preserves source order', async () => {
    const a = await makePdf(['A only'])
    const b = await makePdf(['B only'])
    const ab = await mergeBuffers([a, b])
    const ba = await mergeBuffers([b, a])
    const parsedAb = await PDFDocument.load(ab)
    const parsedBa = await PDFDocument.load(ba)
    expect(parsedAb.getPageCount()).toBe(2)
    expect(parsedBa.getPageCount()).toBe(2)
    // The two merges should NOT produce byte-identical outputs since the
    // page order flips (indirect object references differ).
    expect(Buffer.compare(ab, ba)).not.toBe(0)
  })

  it('produces a valid PDF header/trailer', async () => {
    const a = await makePdf(['one'])
    const merged = await mergeBuffers([a])
    const asString = merged.toString('utf8', 0, 8)
    expect(asString.startsWith('%PDF-')).toBe(true)
    // pdf-lib writes an EOF marker within the last 32 bytes.
    const tail = merged.toString('utf8', Math.max(0, merged.length - 32))
    expect(tail.includes('%%EOF')).toBe(true)
  })
})

describe('mergePdfs contract', () => {
  it('throws when no sources are given', async () => {
    const { mergePdfs } = await import('@/lib/documents/merge')
    await expect(mergePdfs({ userId: 'x', sources: [] })).rejects.toThrow(
      /at least one source/,
    )
  })
})
