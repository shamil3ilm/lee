import { assertSafeUrl as assertSafeNetUrl } from '@/lib/net/ssrf'

/**
 * Back-compat entry point: the https-only synchronous check. The guard
 * itself lives in lib/net/ssrf.ts; fetch through lib/net/safe-fetch.ts so the
 * DNS answers are checked and the connection is pinned.
 */
export function assertSafeUrl(raw: string): URL {
  return assertSafeNetUrl(raw, { httpsOnly: true })
}
