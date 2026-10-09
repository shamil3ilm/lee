/**
 * IP address parsing and the "never fetch this" address classes used by the
 * SSRF guard (lib/net/ssrf.ts). Pure: no DNS, no network.
 *
 * Parsing is deliberately lenient (it accepts every spelling a resolver or
 * socket might accept: `inet_aton` short forms, octal, hex, bracketed IPv6,
 * zone ids, trailing dots) so that no alternative spelling of a private
 * address can slip past the classifier as "not an IP".
 */

/** [network, prefixLength] pairs, IPv4 as a 32-bit unsigned number. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"; 0.0.0.0 reaches localhost on Linux
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // carrier-grade NAT (RFC 6598)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // RFC 1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast 255.255.255.255
]

const V4_PART = /^(?:0x[0-9a-f]*|0[0-7]*|[1-9][0-9]*)$/i

function parsePart(p: string): number | null {
  if (!V4_PART.test(p)) return null
  if (/^0x/i.test(p)) return p.length === 2 ? 0 : parseInt(p.slice(2), 16)
  if (p.length > 1 && p.startsWith('0')) return parseInt(p, 8)
  return Number(p)
}

/**
 * Parse an IPv4 address in any form `inet_aton` accepts (`127.0.0.1`,
 * `2130706433`, `0x7f.1`, `017700000001`, `127.1`). Returns the 32-bit value,
 * or null when the string is not an IPv4 literal.
 */
export function parseIPv4(input: string): number | null {
  const s = input.replace(/\.+$/, '')
  if (!s) return null
  const parts = s.split('.')
  if (parts.length > 4) return null
  const nums: number[] = []
  for (const p of parts) {
    const n = parsePart(p)
    if (n === null || !Number.isFinite(n)) return null
    nums.push(n)
  }
  const last = nums.pop() as number
  if (nums.some((n) => n > 255)) return null
  const lastMax = 2 ** (8 * (4 - nums.length)) - 1
  if (last > lastMax) return null
  let value = 0
  nums.forEach((n, i) => {
    value += n * 2 ** (8 * (3 - i))
  })
  return value + last
}

function v4FromString(ip: string): number {
  const [a = 0, b = 0, c = 0, d = 0] = ip.split('.').map(Number)
  return ((a * 256 + b) * 256 + c) * 256 + d
}

function inV4Cidr(value: number, network: string, prefix: number): boolean {
  const size = 2 ** (32 - prefix)
  const base = v4FromString(network)
  return value >= base && value < base + size
}

export function isBlockedIPv4(value: number): boolean {
  return BLOCKED_V4.some(([net, prefix]) => inV4Cidr(value, net, prefix))
}

export function formatIPv4(value: number): string {
  return [24, 16, 8, 0].map((s) => Math.floor(value / 2 ** s) % 256).join('.')
}

/** Parse an IPv6 literal (brackets, zone id and an embedded IPv4 tail allowed) into 16 bytes. */
export function parseIPv6(input: string): Uint8Array | null {
  let s = input.trim()
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
  const zone = s.indexOf('%')
  if (zone >= 0) s = s.slice(0, zone)
  if (!s.includes(':')) return null
  if (!/^[0-9a-f:.]+$/i.test(s)) return null

  let tail: number[] = []
  const lastColon = s.lastIndexOf(':')
  const after = s.slice(lastColon + 1)
  if (after.includes('.')) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(after)) return null
    const [a = 0, b = 0, c = 0, d = 0] = after.split('.').map(Number)
    if ([a, b, c, d].some((o) => o > 255)) return null
    tail = [(a << 8) | b, (c << 8) | d]
    s = s.slice(0, lastColon + 1) + '0:0' // placeholder groups, replaced below
  }

  const halves = s.split('::')
  if (halves.length > 2) return null
  const toGroups = (h: string): string[] => (h === '' ? [] : h.split(':'))
  const head = toGroups(halves[0] ?? '')
  const rest = halves.length === 2 ? toGroups(halves[1] ?? '') : []
  const total = 8
  let groups: string[]
  if (halves.length === 2) {
    const missing = total - head.length - rest.length
    if (missing < 1) return null
    groups = [...head, ...Array<string>(missing).fill('0'), ...rest]
  } else {
    groups = head
  }
  if (groups.length !== total) return null
  const words: number[] = []
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null
    words.push(parseInt(g, 16))
  }
  if (tail.length) {
    words[6] = tail[0] ?? 0
    words[7] = tail[1] ?? 0
  }
  const bytes = new Uint8Array(16)
  words.forEach((w, i) => {
    bytes[i * 2] = w >> 8
    bytes[i * 2 + 1] = w & 0xff
  })
  return bytes
}

function prefixMatch(bytes: Uint8Array, prefix: number[], bits: number): boolean {
  for (let i = 0; i < bits; i++) {
    const byte = i >> 3
    const mask = 0x80 >> (i & 7)
    if (((bytes[byte] ?? 0) & mask) !== ((prefix[byte] ?? 0) & mask)) return false
  }
  return true
}

function embeddedV4(bytes: Uint8Array, offset: number): number {
  const at = (i: number): number => bytes[offset + i] ?? 0
  return ((at(0) * 256 + at(1)) * 256 + at(2)) * 256 + at(3)
}

/** IPv6 ranges that are never a public web server. */
const BLOCKED_V6: ReadonlyArray<readonly [number[], number]> = [
  [[0xfe, 0x80], 10], // link-local
  [[0xfe, 0xc0], 10], // site-local (deprecated)
  [[0xfc], 7], // unique local (fc00::/7)
  [[0xff], 8], // multicast
  [[0x01, 0x00, 0, 0, 0, 0, 0, 0], 64], // discard-only
  [[0x20, 0x01, 0x0d, 0xb8], 32], // documentation
  [[0x20, 0x01, 0x00, 0x00], 32], // Teredo (tunnels to an arbitrary IPv4)
  [[0x20, 0x01, 0x00, 0x10], 28], // ORCHID
]

export function isBlockedIPv6(bytes: Uint8Array): boolean {
  // ::/96 covers :: (unspecified), ::1 (loopback) and the deprecated
  // IPv4-compatible form; ::ffff:0:0/96 is IPv4-mapped. Both are judged by
  // the embedded IPv4 address, and ::/::1 are blocked outright.
  if (prefixMatch(bytes, [], 96)) return true
  if (prefixMatch(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff], 96)) {
    return isBlockedIPv4(embeddedV4(bytes, 12))
  }
  // NAT64 (64:ff9b::/96 and the local-use 64:ff9b:1::/48) embed an IPv4.
  if (prefixMatch(bytes, [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0], 96)) {
    return isBlockedIPv4(embeddedV4(bytes, 12))
  }
  if (prefixMatch(bytes, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01], 48)) return true
  // 6to4 (2002::/16) embeds the IPv4 in bytes 2-5.
  if (prefixMatch(bytes, [0x20, 0x02], 16)) return isBlockedIPv4(embeddedV4(bytes, 2))
  return BLOCKED_V6.some(([p, bits]) => prefixMatch(bytes, p, bits))
}

export type ParsedIp = { family: 4; value: number } | { family: 6; bytes: Uint8Array }

/** Parse any IPv4 or IPv6 spelling; null when `host` is a name, not an address. */
export function parseIp(host: string): ParsedIp | null {
  const v6 = parseIPv6(host)
  if (v6) return { family: 6, bytes: v6 }
  const v4 = parseIPv4(host)
  if (v4 !== null) return { family: 4, value: v4 }
  return null
}

/** True when `ip` (any spelling) is in a blocked class. Non-IP input returns false. */
export function isBlockedAddress(ip: string): boolean {
  const parsed = parseIp(ip)
  if (!parsed) return false
  return parsed.family === 4 ? isBlockedIPv4(parsed.value) : isBlockedIPv6(parsed.bytes)
}
