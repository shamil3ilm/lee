import { describe, expect, it } from 'vitest'
import { fetchVariantPdf, PDF_MESSAGES, variantPdfUrl } from '@/lib/variants/pdf-client'

const pdfResponse = (): Response => new Response('%PDF-1.4\n%%EOF\n', { status: 200, headers: { 'content-type': 'application/pdf' } })

function hangingFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })) as typeof fetch
}

describe('fetchVariantPdf', () => {
  it('fetches the document PDF route and reports its size', async () => {
    let called = ''
    const r = await fetchVariantPdf('doc-1', {
      fetchImpl: (async (url: string) => {
        called = url
        return pdfResponse()
      }) as typeof fetch,
    })
    expect(called).toBe(variantPdfUrl('doc-1'))
    expect(r).toEqual({ ok: true, bytes: 15 })
  })

  it.each([
    [422, 'compile'],
    [503, 'unavailable'],
    [504, 'unavailable'],
    [429, 'unavailable'],
    [404, 'other'],
  ] as const)('maps status %i to %s', async (status, reason) => {
    const r = await fetchVariantPdf('d', { fetchImpl: (async () => new Response('{}', { status })) as typeof fetch })
    expect(r).toEqual({ ok: false, reason, message: PDF_MESSAGES[reason] })
  })

  it('stops a request that never answers at the client deadline', async () => {
    const started = Date.now()
    const r = await fetchVariantPdf('d', { fetchImpl: hangingFetch(), timeoutMs: 50 })
    expect(r).toMatchObject({ ok: false, reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('reports a user cancel as cancelled', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)
    const r = await fetchVariantPdf('d', { fetchImpl: hangingFetch(), signal: controller.signal, timeoutMs: 5_000 })
    expect(r).toMatchObject({ ok: false, reason: 'cancelled', message: 'PDF cancelled.' })
  })

  it('treats a network error as the service being unavailable', async () => {
    const r = await fetchVariantPdf('d', { fetchImpl: (async () => Promise.reject(new TypeError('fetch failed'))) as typeof fetch })
    expect(r).toMatchObject({ ok: false, reason: 'unavailable' })
  })
})
