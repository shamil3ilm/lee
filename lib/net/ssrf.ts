import { lookup as dnsLookup } from 'node:dns/promises'
import { formatIPv4, isBlockedAddress, parseIp } from './ip'

/**
 * The SSRF guard: decides whether a URL taken from a user or a third party
 * may be fetched by the server. Checks, in order:
 *
 *  1. scheme is http or https (or https only, when the caller asks);
 *  2. no `user:pass@` userinfo (a classic way to disguise the real host);
 *  3. the host is not a local-only name (localhost, *.local, *.internal, …,
 *     single-label names, trailing dots stripped first);
 *  4. a literal IP, in any spelling (decimal, octal, hex, short form,
 *     bracketed IPv6, IPv4-mapped/compatible/NAT64/6to4 IPv6), is not in a
 *     blocked class (lib/net/ip.ts);
 *  5. (async) a hostname resolves, and **every** resolved address passes 4.
 *
 * `safeFetch` (lib/net/safe-fetch.ts) then pins the TCP connection to the
 * vetted address so a second DNS answer (rebinding) cannot change it, and
 * re-runs all of this on every redirect hop.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(`unsafe url: ${message}`)
    this.name = 'UnsafeUrlError'
  }
}

export interface AssertSafeUrlOptions {
  /** Reject plain http (default false: http and https both allowed). */
  httpsOnly?: boolean
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa', '.corp', '.localdomain']
const LOCAL_NAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback', 'broadcasthost'])

/** Lower-cased host with brackets kept off and trailing dots removed. */
export function normalizeHost(hostname: string): string {
  let h = hostname.toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  return h.replace(/\.+$/, '')
}

function assertHostAllowed(host: string): void {
  if (!host) throw new UnsafeUrlError('empty host')
  const ip = parseIp(host)
  if (ip) {
    if (isBlockedAddress(host)) throw new UnsafeUrlError(`private address ${host}`)
    return
  }
  if (LOCAL_NAMES.has(host) || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError(`local host name ${host}`)
  }
  if (!host.includes('.')) throw new UnsafeUrlError(`single-label host ${host}`)
}

/**
 * Synchronous checks (1–4). Returns the parsed URL; throws `UnsafeUrlError`.
 * Use `resolveSafeHost` (or just `safeFetch`) for the DNS check.
 */
export function assertSafeUrl(raw: string | URL, opts: AssertSafeUrlOptions = {}): URL {
  let u: URL
  try {
    u = new URL(raw.toString())
  } catch {
    throw new UnsafeUrlError('not a valid url')
  }
  const allowed = opts.httpsOnly ? ['https:'] : ['https:', 'http:']
  if (!allowed.includes(u.protocol)) throw new UnsafeUrlError(`protocol ${u.protocol}`)
  if (u.username || u.password) throw new UnsafeUrlError('credentials in url')
  assertHostAllowed(normalizeHost(u.hostname))
  return u
}

export interface ResolvedAddress {
  address: string
  family: 4 | 6
}

export type HostResolver = (host: string) => Promise<ResolvedAddress[]>

const systemResolver: HostResolver = async (host) => {
  const answers = await dnsLookup(host, { all: true, verbatim: true })
  return answers.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }))
}

/**
 * Test seam: tests/setup.ts installs a resolver here so the suite never
 * touches real DNS. Production never sets it.
 */
interface NetHooks {
  resolve?: HostResolver
}
export function netHooks(): NetHooks {
  return ((globalThis as { __leeNetHooks?: NetHooks }).__leeNetHooks ??= {})
}

/**
 * Resolve the URL's host and check every address. Returns the vetted
 * addresses (IPv4 first), for pinning. A literal IP returns itself.
 */
export async function resolveSafeHost(u: URL): Promise<ResolvedAddress[]> {
  const host = normalizeHost(u.hostname)
  assertHostAllowed(host)
  const literal = parseIp(host)
  if (literal) {
    return [literal.family === 4 ? { address: formatIPv4(literal.value), family: 4 } : { address: host, family: 6 }]
  }
  let answers: ResolvedAddress[]
  try {
    answers = await (netHooks().resolve ?? systemResolver)(host)
  } catch (e) {
    throw new UnsafeUrlError(`cannot resolve ${host}: ${(e as Error).message}`)
  }
  if (answers.length === 0) throw new UnsafeUrlError(`no address for ${host}`)
  const bad = answers.find((a) => isBlockedAddress(a.address))
  if (bad) throw new UnsafeUrlError(`${host} resolves to private address ${bad.address}`)
  return [...answers].sort((a, b) => a.family - b.family)
}

/** Full check (sync + DNS) without fetching. */
export async function assertSafeUrlResolved(raw: string | URL, opts: AssertSafeUrlOptions = {}): Promise<URL> {
  const u = assertSafeUrl(raw, opts)
  await resolveSafeHost(u)
  return u
}
