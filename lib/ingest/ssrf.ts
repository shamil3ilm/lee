import { isIP } from 'node:net'

// TODO(v1.5 hardening): resolve hostname to IP(s) via DNS and re-check each
// answer against these ranges to defend against DNS rebinding. For v1 the
// URL is provided by the authenticated single user, so hostname-only checks
// are acceptable.
const PRIVATE_RANGES = [
  /^127\./,          // loopback
  /^10\./,           // RFC1918
  /^192\.168\./,     // RFC1918
  /^169\.254\./,     // link-local
  /^0\./,            // unspecified
  /^::1$/,           // v6 loopback
  /^fc/i, /^fd/i,    // v6 ULA
  /^fe80/i,          // v6 link-local
]

// 172.16.0.0 – 172.31.255.255
function is172Private(ip: string): boolean {
  const m = /^172\.(\d+)\./.exec(ip)
  if (!m) return false
  const n = Number(m[1])
  return n >= 16 && n <= 31
}

export function assertSafeUrl(raw: string): URL {
  const u = new URL(raw)
  if (u.protocol !== 'https:') throw new Error(`unsafe url: protocol ${u.protocol}`)
  const host = u.hostname.toLowerCase()
  if (host === 'localhost') throw new Error('unsafe url: localhost')
  if (isIP(host)) {
    if (PRIVATE_RANGES.some((re) => re.test(host)) || is172Private(host)) {
      throw new Error(`unsafe url: private ip ${host}`)
    }
  }
  return u
}
