import { assertSafeUrl } from './ssrf'

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000

export type FetchResult = { html: string; finalUrl: string; status: number }

export async function fetchPage(url: string): Promise<FetchResult> {
  const u = assertSafeUrl(url)
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(u, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'employ-app/0.1 (+personal-tool)' },
    })
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
