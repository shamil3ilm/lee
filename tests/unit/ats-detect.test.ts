import { describe, it, expect, vi } from 'vitest'
import { detectATSFromDomain } from '@/lib/companies/ats-detect'

describe('detectATSFromDomain', () => {
  it('returns greenhouse when its board responds 200', async () => {
    global.fetch = vi.fn(
      async (url: RequestInfo | URL) =>
        new Response('', { status: String(url).includes('greenhouse') ? 200 : 404 }),
    ) as unknown as typeof fetch
    const r = await detectATSFromDomain('stripe.com')
    expect(r?.kind).toBe('greenhouse')
    expect(r?.slug).toBe('stripe')
  })

  it('returns lever when only lever responds', async () => {
    global.fetch = vi.fn(
      async (url: RequestInfo | URL) =>
        new Response('', { status: String(url).includes('lever.co') ? 200 : 404 }),
    ) as unknown as typeof fetch
    const r = await detectATSFromDomain('example.com')
    expect(r?.kind).toBe('lever')
    expect(r?.slug).toBe('example')
  })

  it('returns null if nothing responds', async () => {
    global.fetch = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch
    expect(await detectATSFromDomain('foo.com')).toBeNull()
  })

  it('strips www. prefix when generating slug', async () => {
    global.fetch = vi.fn(
      async (url: RequestInfo | URL) =>
        new Response('', { status: String(url).includes('/acme/') ? 200 : 404 }),
    ) as unknown as typeof fetch
    const r = await detectATSFromDomain('www.acme.com')
    expect(r?.slug).toBe('acme')
  })

  it('swallows fetch errors and keeps probing', async () => {
    let call = 0
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      call += 1
      if (call === 1) throw new Error('network down')
      return new Response('', { status: String(url).includes('lever') ? 200 : 404 })
    }) as unknown as typeof fetch
    const r = await detectATSFromDomain('acme.com')
    expect(r?.kind).toBe('lever')
  })
})
