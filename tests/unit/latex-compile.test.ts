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
