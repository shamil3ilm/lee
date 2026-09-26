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
  it('sends main.tex and every asset in ONE tarball (latexonline.cc rejects loose files)', async () => {
    let captured: FormData | null = null
    const pdfBytes = new Uint8Array([37, 80, 68, 70, 45])
    globalThis.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = init?.body as FormData
      return new Response(pdfBytes, { status: 200 })
    }) as unknown as typeof fetch

    const result = await compileLatex({
      source: '\documentclass{article}\begin{document}\includegraphics{photo.jpg}\end{document}',
      assets: [
        { filename: 'photo.jpg', mimeType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) },
        { filename: 'cover.pdf', mimeType: 'application/pdf', bytes: Buffer.from([0x25, 0x50]) },
      ],
    })
    expect(result.ok).toBe(true)
    expect(captured).not.toBeNull()

    const values = captured!.getAll('file') as unknown[]
    expect(values).toHaveLength(1)
    const tar = new Uint8Array(await (values[0] as File).arrayBuffer())
    const decoder = new TextDecoder()
    // Walk the ustar headers and collect the file names and payloads.
    const files: Record<string, number[]> = {}
    let off = 0
    while (off + 512 <= tar.length && tar[off] !== 0) {
      const name = decoder.decode(tar.subarray(off, off + 100)).replace(/\0.*$/s, '')
      const size = parseInt(decoder.decode(tar.subarray(off + 124, off + 136)).replace(/\0.*$/s, '').trim(), 8)
      files[name] = [...tar.subarray(off + 512, off + 512 + size)]
      off += 512 + Math.ceil(size / 512) * 512
    }
    expect(Object.keys(files).sort()).toEqual(['cover.pdf', 'main.tex', 'photo.jpg'])
    expect(files['photo.jpg']).toEqual([0xff, 0xd8, 0xff])
    expect(decoder.decode(new Uint8Array(files['main.tex']!))).toContain('includegraphics{photo.jpg}')
  })

  it('returns a friendly 422 for an unsafe asset file name instead of calling the service', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const result = await compileLatex({
      source: 'x',
      assets: [{ filename: '../secret.png', mimeType: 'image/png', bytes: Buffer.from([1]) }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(422)
      expect(result.log).toMatch(/file name/i)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('backwards compatible: bare source string still works', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([1]), { status: 200 }),
    ) as unknown as typeof fetch
    const result = await compileLatex('hello')
    expect(result.ok).toBe(true)
  })
})
