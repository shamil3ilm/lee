import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBlockedAddress, parseIPv4, parseIPv6 } from '@/lib/net/ip'
import { assertSafeUrl, assertSafeUrlResolved, netHooks, UnsafeUrlError, type HostResolver } from '@/lib/net/ssrf'
import { pinnedLookup, safeFetch } from '@/lib/net/safe-fetch'

const originalResolve = netHooks().resolve
afterEach(() => {
  netHooks().resolve = originalResolve
})

/** Bypass attempts: every one must be rejected by the synchronous check. */
const BYPASSES: Array<[string, string]> = [
  // IPv6 loopback / unspecified / link-local / ULA / site-local / multicast
  ['https://[::1]/', 'IPv6 loopback (the verified bypass)'],
  ['https://[0:0:0:0:0:0:0:1]/', 'IPv6 loopback, long form'],
  ['https://[::]/', 'IPv6 unspecified'],
  ['https://[fe80::1]/', 'IPv6 link-local'],
  ['https://[febf::1]/', 'IPv6 link-local, top of fe80::/10'],
  ['https://[fc00::1]/', 'IPv6 ULA fc'],
  ['https://[fd12:3456::1]/', 'IPv6 ULA fd'],
  ['https://[fec0::1]/', 'IPv6 site-local'],
  ['https://[ff02::1]/', 'IPv6 multicast'],
  // IPv4-mapped / compatible / NAT64 / 6to4 IPv6
  ['https://[::ffff:127.0.0.1]/', 'IPv4-mapped loopback, dotted'],
  ['https://[::ffff:7f00:1]/', 'IPv4-mapped loopback, hex'],
  ['https://[::ffff:169.254.169.254]/', 'IPv4-mapped metadata'],
  ['https://[::ffff:a00:1]/', 'IPv4-mapped 10.0.0.1'],
  ['https://[::127.0.0.1]/', 'IPv4-compatible loopback'],
  ['https://[64:ff9b::7f00:1]/', 'NAT64 loopback'],
  ['https://[2002:7f00:1::]/', '6to4 loopback'],
  ['https://[2002:a9fe:a9fe::]/', '6to4 metadata'],
  // IPv4 classes
  ['https://0.0.0.0/', '0.0.0.0'],
  ['https://0.1.2.3/', '0/8'],
  ['https://10.1.2.3/', '10/8'],
  ['https://100.64.0.1/', 'CGNAT low'],
  ['https://100.127.255.254/', 'CGNAT high'],
  ['https://127.0.0.1/', 'loopback'],
  ['https://127.255.255.254/', 'loopback, top of 127/8'],
  ['https://169.254.169.254/latest/meta-data/', 'cloud metadata'],
  ['https://172.16.0.1/', '172.16/12 low'],
  ['https://172.31.255.254/', '172.16/12 high'],
  ['https://192.168.0.1/', '192.168/16'],
  ['https://198.18.0.1/', 'benchmarking 198.18/15'],
  ['https://198.19.255.1/', 'benchmarking, top of 198.18/15'],
  ['https://224.0.0.1/', 'multicast'],
  ['https://239.255.255.250/', 'multicast SSDP'],
  ['https://240.0.0.1/', 'reserved 240/4'],
  ['https://255.255.255.255/', 'broadcast'],
  // Alternative IPv4 spellings
  ['https://2130706433/', 'decimal loopback'],
  ['https://0x7f000001/', 'hex loopback'],
  ['https://0x7f.1/', 'hex short form'],
  ['https://017700000001/', 'octal loopback'],
  ['https://0177.0.0.1/', 'octal first octet'],
  ['https://127.1/', 'short form 127.1'],
  ['https://127.0.0.1./', 'trailing dot on an IP'],
  ['https://2852039166/', 'decimal metadata 169.254.169.254'],
  // Names
  ['https://localhost/', 'localhost'],
  ['https://LOCALHOST./', 'localhost, upper case + trailing dot'],
  ['https://api.localhost/', '*.localhost'],
  ['https://printer.local/', '*.local mDNS'],
  ['https://metadata.google.internal/computeMetadata/v1/', 'GCP metadata name'],
  ['https://intranet/', 'single-label host'],
  // Schemes and userinfo
  ['file:///etc/passwd', 'file scheme'],
  ['ftp://example.com/', 'ftp scheme'],
  ['gopher://example.com:70/', 'gopher scheme'],
  ['data:text/html,hi', 'data scheme'],
  ['javascript:alert(1)', 'javascript scheme'],
  ['https://user:pass@example.com/', 'userinfo'],
  ['https://example.com@127.0.0.1/', 'userinfo disguising a loopback host'],
  ['https://example.com:443@[::1]/', 'userinfo + IPv6 loopback'],
  ['not a url', 'garbage'],
]

describe('assertSafeUrl: bypass attempts', () => {
  it('has at least 40 cases', () => expect(BYPASSES.length).toBeGreaterThanOrEqual(40))
  it.each(BYPASSES)('rejects %s (%s)', (url) => {
    expect(() => assertSafeUrl(url)).toThrow(UnsafeUrlError)
  })
})

describe('assertSafeUrl: allowed', () => {
  it.each([
    'https://example.com/jobs.rss',
    'http://example.com/feed',
    'https://boards.greenhouse.io/acme',
    'https://8.8.8.8/',
    'https://[2606:4700:4700::1111]/',
    'https://100.128.0.1/', // just outside CGNAT
    'https://172.32.0.1/', // just outside 172.16/12
    'https://example.com./', // trailing dot on a public name
  ])('accepts %s', (url) => expect(() => assertSafeUrl(url)).not.toThrow())

  it('httpsOnly rejects http', () => {
    expect(() => assertSafeUrl('http://example.com', { httpsOnly: true })).toThrow(UnsafeUrlError)
  })
})

describe('DNS resolution: every answer is checked', () => {
  const resolveTo = (...addresses: string[]): HostResolver => async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? (6 as const) : (4 as const) }))

  it.each([
    ['127.0.0.1'],
    ['10.0.0.5'],
    ['169.254.169.254'],
    ['::1'],
    ['::ffff:127.0.0.1'],
    ['fd00::1'],
    ['100.64.1.1'],
  ])('rejects a name resolving to %s', async (addr) => {
    netHooks().resolve = resolveTo(addr)
    await expect(assertSafeUrlResolved('https://127.0.0.1.nip.io/')).rejects.toThrow(UnsafeUrlError)
  })

  it('rejects when ANY of several answers is private', async () => {
    netHooks().resolve = resolveTo('93.184.215.14', '10.0.0.1')
    await expect(assertSafeUrlResolved('https://mixed.example.com/')).rejects.toThrow(/private address 10\.0\.0\.1/)
  })

  it('rejects a name with no answers or a resolver failure', async () => {
    netHooks().resolve = resolveTo()
    await expect(assertSafeUrlResolved('https://empty.example.com/')).rejects.toThrow(UnsafeUrlError)
    netHooks().resolve = async () => {
      throw new Error('ENOTFOUND')
    }
    await expect(assertSafeUrlResolved('https://nx.example.com/')).rejects.toThrow(UnsafeUrlError)
  })

  it('accepts a name resolving only to public addresses', async () => {
    netHooks().resolve = resolveTo('93.184.215.14', '2606:4700::6810:84e5')
    await expect(assertSafeUrlResolved('https://ok.example.com/')).resolves.toBeInstanceOf(URL)
  })
})

describe('safeFetch', () => {
  it('pins the connection: the lookup answers only with the vetted address', () => {
    const lookup = pinnedLookup({ address: '93.184.215.14', family: 4 })
    const single = vi.fn()
    lookup('evil.example.com', {}, single)
    expect(single).toHaveBeenCalledWith(null, '93.184.215.14', 4)
    const all = vi.fn()
    lookup('evil.example.com', { all: true }, all)
    expect(all).toHaveBeenCalledWith(null, [{ address: '93.184.215.14', family: 4 }])
  })

  it('re-checks every redirect hop (public → loopback is refused)', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://[::1]:8080/admin' } }))
    await expect(
      safeFetch('https://example.com/start', {}, { timeoutMs: 1000, label: 't', fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(UnsafeUrlError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('re-resolves on a redirect to a name that resolves privately', async () => {
    netHooks().resolve = async (host) =>
      host === 'internal.example.com' ? [{ address: '10.0.0.7', family: 4 }] : [{ address: '93.184.215.14', family: 4 }]
    const fetchImpl = vi.fn(async () => new Response(null, { status: 301, headers: { location: 'https://internal.example.com/' } }))
    await expect(
      safeFetch('https://example.com/', {}, { timeoutMs: 1000, label: 't', fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/private address 10\.0\.0\.7/)
  })

  it('caps redirect hops', async () => {
    let n = 0
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: `https://example.com/${++n}` } }))
    await expect(
      safeFetch('https://example.com/', {}, { timeoutMs: 1000, label: 't', maxRedirects: 3, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/too many redirects/)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('follows a safe redirect, drops credentials cross-origin, and returns the final body', async () => {
    const seen: Array<{ url: string; auth: string | null; redirect?: RequestRedirect }> = []
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get('authorization'), redirect: init.redirect })
      if (url.startsWith('https://a.example.com')) return new Response(null, { status: 302, headers: { location: 'https://b.example.com/x' } })
      return new Response('ok')
    })
    const res = await safeFetch(
      'https://a.example.com/',
      { headers: { authorization: 'Bearer t' } },
      { timeoutMs: 1000, label: 't', fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(await res.text()).toBe('ok')
    expect(seen).toEqual([
      { url: 'https://a.example.com/', auth: 'Bearer t', redirect: 'manual' },
      { url: 'https://b.example.com/x', auth: null, redirect: 'manual' },
    ])
  })

  it('caps the body size', async () => {
    const fetchImpl = vi.fn(async () => new Response('x'.repeat(2000)))
    const res = await safeFetch('https://example.com/', {}, { timeoutMs: 1000, label: 't', maxBytes: 100, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(res.text()).rejects.toThrow(/too large/)
  })

  it('refuses before connecting when the first URL is unsafe', async () => {
    const fetchImpl = vi.fn()
    await expect(
      safeFetch('https://[::1]/', {}, { timeoutMs: 1000, label: 't', fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(UnsafeUrlError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('ip parsing', () => {
  it.each([
    ['127.0.0.1', 0x7f000001],
    ['2130706433', 0x7f000001],
    ['0x7f.1', 0x7f000001],
    ['017700000001', 0x7f000001],
    ['127.1', 0x7f000001],
    ['10.0.0.1.', 0x0a000001],
  ])('parseIPv4(%s)', (s, v) => expect(parseIPv4(s)).toBe(v))

  it.each(['example.com', '256.1.1.1', '1.2.3.4.5', '08.1.1.1', ''])('parseIPv4(%s) is null', (s) => expect(parseIPv4(s)).toBeNull())

  it('parses IPv6 forms', () => {
    expect(parseIPv6('[::1]')?.[15]).toBe(1)
    expect(parseIPv6('fe80::1%eth0')?.[0]).toBe(0xfe)
    expect(parseIPv6('::ffff:1.2.3.4')?.slice(12)).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(parseIPv6('1:2:3:4:5:6:7:8:9')).toBeNull()
  })

  it('public addresses are not blocked', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '2002:808:808::']) {
      expect(isBlockedAddress(ip)).toBe(false)
    }
  })
})
