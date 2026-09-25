import { describe, it, expect, vi, afterEach } from 'vitest'
import { compileLatex, truncateLog } from '@/lib/latex/compile'

const origFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = origFetch
})

describe('compileLatex', () => {
  it('returns pdf bytes on 2xx', async () => {
    const pdfBytes = new Uint8Array([37, 80, 68, 70, 45]) // '%PDF-'
    globalThis.fetch = vi.fn(async () =>
      new Response(pdfBytes, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    ) as unknown as typeof fetch
    const result = await compileLatex('\\documentclass{article}\\begin{document}x\\end{document}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(new Uint8Array(result.pdf).slice(0, 5)).toEqual(pdfBytes)
    }
  })

  it('returns the log on non-2xx', async () => {
    const logText = '! Undefined control sequence.\nl.5 \\undefinedcmd'
    globalThis.fetch = vi.fn(async () =>
      new Response(logText, { status: 422 }),
    ) as unknown as typeof fetch
    const result = await compileLatex('bad tex')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(422)
      expect(result.log).toContain('Undefined control sequence')
    }
  })

  it('handles network failure gracefully', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const result = await compileLatex('anything')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(502)
      expect(result.log).toContain('ECONNREFUSED')
    }
  })
})

describe('truncateLog', () => {
  it('caps at 20k chars', () => {
    const big = 'a'.repeat(30_000)
    expect(truncateLog(big).length).toBe(20_000)
  })
})

describe('compileLatex with assets', () => {
  it('sends every asset alongside main.tex as multipart file fields', async () => {
    let captured: FormData | null = null
    const pdfBytes = new Uint8Array([37, 80, 68, 70, 45])
    globalThis.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = init?.body as FormData
      return new Response(pdfBytes, { status: 200 })
    }) as unknown as typeof fetch

    const result = await compileLatex({
      source: '\\documentclass{article}\\begin{document}\\includegraphics{photo.jpg}\\end{document}',
      assets: [
        { filename: 'photo.jpg', mimeType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) },
        { filename: 'cover.pdf', mimeType: 'application/pdf', bytes: Buffer.from([0x25, 0x50]) },
      ],
    })
    expect(result.ok).toBe(true)
    expect(captured).not.toBeNull()

    // Every `file` field's filename should include main.tex plus each asset.
    const values = captured!.getAll('file') as unknown[]
    expect(values).toHaveLength(3)
    const names = values.map((v) => (v as File).name)
    expect(names).toContain('main.tex')
    expect(names).toContain('photo.jpg')
    expect(names).toContain('cover.pdf')

    // MIME types should be preserved on the Blob for each asset.
    const photoBlob = values.find((v) => (v as File).name === 'photo.jpg') as File
    expect(photoBlob.type).toBe('image/jpeg')
    const pdfBlob = values.find((v) => (v as File).name === 'cover.pdf') as File
    expect(pdfBlob.type).toBe('application/pdf')

    // Byte payload for one asset should round-trip.
    const photoBytes = new Uint8Array(await photoBlob.arrayBuffer())
    expect([...photoBytes]).toEqual([0xff, 0xd8, 0xff])
  })

  it('backwards compatible: bare source string still works', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([1]), { status: 200 }),
    ) as unknown as typeof fetch
    const result = await compileLatex('hello')
    expect(result.ok).toBe(true)
  })
})
