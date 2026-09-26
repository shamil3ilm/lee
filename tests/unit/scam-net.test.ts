import { describe, expect, it, vi } from 'vitest'
import { ageInDays, isLookupableDomain, lookupDomainAge, lookupMx } from '@/lib/scam/net'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}

const rdapBody = {
  events: [
    { eventAction: 'last changed', eventDate: '2026-01-01T00:00:00Z' },
    { eventAction: 'registration', eventDate: '2026-08-20T10:00:00Z' },
  ],
}

describe('lookupDomainAge (RDAP)', () => {
  it('follows the rdap.org redirect and reads the registration event', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(redirect('https://rdap.verisign.com/com/v1/domain/example.com'))
      .mockResolvedValueOnce(json(rdapBody))
    const res = await lookupDomainAge('example.com', { fetchImpl })
    expect(res).toEqual({ status: 'ok', registeredAt: '2026-08-20T10:00:00.000Z' })
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://rdap.org/domain/example.com')
    const init = fetchImpl.mock.calls[0]![1]!
    expect(init.redirect).toBe('manual')
    expect((init.headers as Record<string, string>).accept).toContain('application/rdap+json')
  })

  it('404 → not_found', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({}, 404))
    expect(await lookupDomainAge('nope.com', { fetchImpl })).toEqual({ status: 'not_found' })
  })

  it.each([
    ['server error', () => json({}, 503)],
    ['no registration event', () => json({ events: [] })],
    ['bad date', () => json({ events: [{ eventAction: 'registration', eventDate: 'soon' }] })],
    ['malformed json', () => new Response('<html>', { status: 200 })],
  ])('%s → error, never throws', async (_name, make) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(make())
    const res = await lookupDomainAge('example.com', { fetchImpl })
    expect(res.status).toBe('error')
  })

  it('network failure → error', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'))
    expect(await lookupDomainAge('example.com', { fetchImpl })).toEqual({ status: 'error', reason: 'fetch failed' })
  })

  it('times out even when fetch ignores the abort signal', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(() => {}))
    const started = Date.now()
    const res = await lookupDomainAge('example.com', { fetchImpl, timeoutMs: 30 })
    expect(res).toEqual({ status: 'error', reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it.each([
    'http://rdap.example.net/domain/example.com',
    'https://127.0.0.1/domain/example.com',
    'https://localhost/x',
  ])('refuses unsafe redirect to %s', async (loc) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(redirect(loc)).mockResolvedValue(json(rdapBody))
    const res = await lookupDomainAge('example.com', { fetchImpl })
    expect(res.status).toBe('error')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('never calls out for an invalid domain', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    expect((await lookupDomainAge('localhost', { fetchImpl })).status).toBe('error')
    expect((await lookupDomainAge('аmazon.com', { fetchImpl })).status).toBe('error')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('lookupMx (DNS-over-HTTPS)', () => {
  it('uses the Cloudflare JSON API and finds MX answers', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ Status: 0, Answer: [{ name: 'acme.com', type: 15, data: '10 mx.acme.com.' }] }))
    expect(await lookupMx('acme.com', { fetchImpl })).toEqual({ status: 'ok', hasMx: true })
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://cloudflare-dns.com/dns-query?name=acme.com&type=MX')
    expect((fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>).accept).toBe('application/dns-json')
  })

  it('no answers or a null MX → hasMx false', async () => {
    const empty = vi.fn<typeof fetch>().mockResolvedValue(json({ Status: 0 }))
    expect(await lookupMx('acme.com', { fetchImpl: empty })).toEqual({ status: 'ok', hasMx: false })
    const nullMx = vi.fn<typeof fetch>().mockResolvedValue(json({ Status: 0, Answer: [{ type: 15, data: '0 .' }] }))
    expect(await lookupMx('acme.com', { fetchImpl: nullMx })).toEqual({ status: 'ok', hasMx: false })
  })

  it('NXDOMAIN → hasMx false', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ Status: 3 }))
    expect(await lookupMx('ghost-domain.com', { fetchImpl })).toEqual({ status: 'ok', hasMx: false })
  })

  it('SERVFAIL, HTTP errors, timeouts → error', async () => {
    const servfail = vi.fn<typeof fetch>().mockResolvedValue(json({ Status: 2 }))
    expect((await lookupMx('acme.com', { fetchImpl: servfail })).status).toBe('error')
    const http = vi.fn<typeof fetch>().mockResolvedValue(json({}, 500))
    expect((await lookupMx('acme.com', { fetchImpl: http })).status).toBe('error')
    const hang = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(() => {}))
    expect(await lookupMx('acme.com', { fetchImpl: hang, timeoutMs: 20 })).toEqual({
      status: 'error',
      reason: 'timeout',
    })
  })
})

describe('helpers', () => {
  it('validates domains', () => {
    expect(isLookupableDomain('acme.co.in')).toBe(true)
    expect(isLookupableDomain('a.b')).toBe(false)
    expect(isLookupableDomain('acme')).toBe(false)
    expect(isLookupableDomain('-bad-.com')).toBe(false)
  })

  it('computes age in days', () => {
    const now = new Date('2026-09-26T00:00:00Z')
    expect(ageInDays('2026-09-16T00:00:00Z', now)).toBe(10)
    expect(ageInDays(null, now)).toBeNull()
    expect(ageInDays('garbage', now)).toBeNull()
  })
})
