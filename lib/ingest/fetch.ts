import { safeFetch } from '@/lib/net/safe-fetch'

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

export type FetchResult = { html: string; finalUrl: string; status: number }

/**
 * Fetch a user-supplied page (URL import, profile import, Google Alerts
 * feed): https only, SSRF-guarded on every hop with the connection pinned to
 * the vetted address (lib/net/safe-fetch.ts), ≤ 3 redirects, ≤ 2 MB, 10 s.
 */
export async function fetchPage(url: string): Promise<FetchResult> {
  const res = await safeFetch(
    url,
    { headers: { 'user-agent': 'employ-app/0.1 (+personal-tool)' } },
    { timeoutMs: TIMEOUT_MS, label: 'url import', maxBytes: MAX_BYTES, maxRedirects: MAX_REDIRECTS, httpsOnly: true },
  )
  if (!res.body) throw new Error('empty response body')
  const html = await res.text().catch((e: unknown) => {
    throw new Error(/too large/.test(String(e)) ? 'response too large' : String(e))
  })
  return { html, finalUrl: res.url || url, status: res.status }
}
