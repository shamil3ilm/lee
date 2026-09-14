import { assertSafeUrl } from './ssrf'

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type FetchResult = { html: string; finalUrl: string; status: number }

async function followUntilOk(
  start: URL,
  signal: AbortSignal,
  maxRedirects = MAX_REDIRECTS,
): Promise<Response> {
  let current = start
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, {
      signal,
      redirect: 'manual',
      headers: { 'user-agent': 'employ-app/0.1 (+personal-tool)' },
    })
    if (!REDIRECT_STATUSES.has(res.status)) return res
    const loc = res.headers.get('location')
    if (!loc) return res
    // Re-run the SSRF checks on every hop so an attacker cannot start on a
    // safe host and redirect to an internal IP.
    current = assertSafeUrl(new URL(loc, current).toString())
  }
  throw new Error('too many redirects')
}

export async function fetchPage(url: string): Promise<FetchResult> {
  const u = assertSafeUrl(url)
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await followUntilOk(u, controller.signal)
    if (!res.body) throw new Error('empty response body')
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.length
        if (total > MAX_BYTES) throw new Error('response too large')
        chunks.push(value)
      }
    }
    const buf = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) { buf.set(c, offset); offset += c.length }
    const html = new TextDecoder('utf-8').decode(buf)
    return { html, finalUrl: res.url, status: res.status }
  } finally {
    clearTimeout(t)
  }
}
