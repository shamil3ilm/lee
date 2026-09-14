import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchPage } from '@/lib/ingest/fetch'

describe('fetchPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => new Response('<html><body>hi</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })) as unknown as typeof fetch
  })

  it('returns html for https url', async () => {
    const r = await fetchPage('https://example.com')
    expect(r.status).toBe(200)
    expect(r.html).toContain('hi')
  })

  it('rejects http', async () => {
    await expect(fetchPage('http://example.com')).rejects.toThrow()
  })

  it('follows redirects up to the cap and throws beyond it', async () => {
    let hop = 0
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      hop++
      // Return 4 redirect responses in a row (hops 1..4), then would have
      // returned a 200 — but the cap should trigger before that.
      if (hop <= 4) {
        return new Response('', {
          status: 302,
          headers: { location: `https://redirect-${hop}.example.com/next` },
        })
      }
      return new Response(`<html>final ${url}</html>`, { status: 200 })
    }) as unknown as typeof fetch

    await expect(fetchPage('https://start.example.com')).rejects.toThrow(/too many redirects/)
  })

  it('follows redirects within the cap and re-runs SSRF check per hop', async () => {
    let hop = 0
    global.fetch = vi.fn(async () => {
      hop++
      if (hop === 1) {
        return new Response('', {
          status: 301,
          headers: { location: 'https://final.example.com/page' },
        })
      }
      return new Response('<html><body>arrived</body></html>', { status: 200 })
    }) as unknown as typeof fetch

    const r = await fetchPage('https://start.example.com')
    expect(r.status).toBe(200)
    expect(r.html).toContain('arrived')
  })

  it('rejects a redirect that targets a private ip', async () => {
    global.fetch = vi.fn(async () => new Response('', {
      status: 302,
      headers: { location: 'https://10.0.0.1/admin' },
    })) as unknown as typeof fetch

    await expect(fetchPage('https://start.example.com')).rejects.toThrow(/private ip/)
  })
})
