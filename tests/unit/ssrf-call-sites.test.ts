import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RssAdapter } from '@/lib/discovery/adapters/rss'
import { JsonLdAdapter } from '@/lib/discovery/adapters/jsonld'
import { PhenomAdapter, SuccessFactorsAdapter } from '@/lib/discovery/adapters/enterprise'
import { fetchPage } from '@/lib/ingest/fetch'
import { netHooks } from '@/lib/net/ssrf'

/**
 * Regression: user-supplied URLs reach the network only through the SSRF
 * guard. Before lib/net/safe-fetch.ts, the RSS / JSON-LD / SuccessFactors /
 * Phenom adapters fetched whatever the user typed, redirects included.
 */

const originalResolve = netHooks().resolve
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response('<rss><channel></channel></rss>', { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => {
  netHooks().resolve = originalResolve
  vi.unstubAllGlobals()
})

const privateDns = () => {
  netHooks().resolve = async () => [{ address: '10.0.0.8', family: 4 }]
}

describe('user-configured discovery sources', () => {
  it.each([
    ['rss loopback v6', () => new RssAdapter().fetch({ url: 'https://[::1]/feed' })],
    ['rss metadata', () => new RssAdapter().fetch({ url: 'http://169.254.169.254/latest' })],
    ['rss file scheme', () => new RssAdapter().fetch({ url: 'file:///etc/passwd' })],
    ['successfactors internal name', () => new SuccessFactorsAdapter().fetch({ host: 'metadata.google.internal', displayName: 'X' })],
  ])('%s is refused before any request', async (_label, run) => {
    await expect(run()).rejects.toThrow(/unsafe url/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('jsonld skips a private URL without requesting it (per-URL failures are isolated)', async () => {
    await expect(new JsonLdAdapter().fetch({ urls: ['https://192.168.1.1/careers', 'https://[fd00::1]/jobs'] })).resolves.toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a feed host that resolves to a private address is refused (rss)', async () => {
    privateDns()
    await expect(new RssAdapter().fetch({ url: 'https://feeds.example.com/jobs.xml' })).rejects.toThrow(/private address/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a phenom host that resolves privately is refused', async () => {
    privateDns()
    await expect(new PhenomAdapter().fetch({ host: 'careers.example.com' })).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a redirect from a feed to an internal address is refused', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:5432/' } }))
    await expect(new RssAdapter().fetch({ url: 'https://feeds.example.com/jobs.xml' })).rejects.toThrow(/unsafe url/)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('URL import (fetchPage)', () => {
  it('refuses IPv6 loopback and private DNS answers', async () => {
    await expect(fetchPage('https://[::ffff:127.0.0.1]/')).rejects.toThrow(/unsafe url/)
    privateDns()
    await expect(fetchPage('https://jobs.example.com/posting')).rejects.toThrow(/private address/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still fetches a public page', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('<html>ok</html>', { status: 200 }))
    const page = await fetchPage('https://jobs.example.com/posting')
    expect(page.html).toBe('<html>ok</html>')
  })
})
