import { extractMainText } from '@/lib/ingest/html-clean'
import { assertSafeUrl } from '@/lib/ingest/ssrf'
import { safeFetch } from '@/lib/net/safe-fetch'
import { REPUTATION_USER_AGENT } from '@/lib/reputation/http'
import { defaultLimiter, type HostLimiter } from '@/lib/reputation/rate-limit'
import { robotsAllows } from './robots'

/**
 * Fetch one primary source for a brief, safely: https only and never a
 * private address (re-checked on every redirect hop), robots.txt respected
 * (a 4xx robots file allows everything; 5xx or unreachable means "don't"),
 * the shared per-host rate limit and honest User-Agent, a 10 s timeout, a
 * 1 MB cap, and only HTML or text bodies. Returns plain text (≤ 20k chars).
 */

export const SOURCE_MAX_BYTES = 1024 * 1024
export const SOURCE_TEXT_MAX = 20_000
export const SOURCE_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

export interface SourceFetchDeps {
  fetchImpl?: typeof fetch
  limiter?: HostLimiter
  timeoutMs?: number
}

export class SourceBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceBlockedError'
  }
}

async function get(url: URL, deps: SourceFetchDeps, accept: string): Promise<Response> {
  await (deps.limiter ?? defaultLimiter).wait(url.host)
  // safeFetch re-checks (DNS included) and re-pins every redirect hop.
  return safeFetch(
    url,
    { headers: { 'user-agent': REPUTATION_USER_AGENT, accept } },
    {
      timeoutMs: deps.timeoutMs ?? SOURCE_TIMEOUT_MS,
      label: 'radar source',
      maxRedirects: MAX_REDIRECTS,
      maxBytes: SOURCE_MAX_BYTES,
      httpsOnly: true,
      fetchImpl: deps.fetchImpl,
    },
  )
}

async function readCapped(res: Response): Promise<string> {
  const text = await res.text().catch((e: unknown) => {
    throw new Error(/too large/.test(String(e)) ? 'source too large' : String(e))
  })
  if (text.length > SOURCE_MAX_BYTES) throw new Error('source too large')
  return text
}

const robotsCache = new Map<string, Promise<string | null>>()

/** robots.txt text; '' when absent (4xx); null when it can't be read (be conservative). */
async function robotsFor(origin: URL, deps: SourceFetchDeps): Promise<string | null> {
  const key = origin.origin
  if (!deps.fetchImpl && robotsCache.has(key)) return robotsCache.get(key) as Promise<string | null>
  const p = (async () => {
    try {
      const res = await get(new URL('/robots.txt', origin), deps, 'text/plain')
      if (res.status >= 400 && res.status < 500) return ''
      if (!res.ok) return null
      return await readCapped(res)
    } catch {
      return null
    }
  })()
  if (!deps.fetchImpl) robotsCache.set(key, p)
  return p
}

export async function fetchSourceText(rawUrl: string, deps: SourceFetchDeps = {}): Promise<string> {
  const url = assertSafeUrl(rawUrl)
  const robots = await robotsFor(url, deps)
  if (robots === null) throw new SourceBlockedError(`${url.host}: robots.txt unreadable`)
  if (!robotsAllows(robots, `${url.pathname}${url.search}`)) throw new SourceBlockedError(`${url.host}: disallowed by robots.txt`)
  const res = await get(url, deps, 'text/html, text/plain, text/markdown;q=0.9')
  if (!res.ok) throw new Error(`${url.host}: HTTP ${res.status}`)
  const type = (res.headers.get('content-type') ?? '').toLowerCase()
  if (type && !/text\/|markdown|xhtml/.test(type)) throw new Error(`${url.host}: not a text page`)
  const body = await readCapped(res)
  const text = type.includes('html') || /^\s*</.test(body) ? extractMainText(body) : body.replace(/\s+/g, ' ').trim()
  return text.slice(0, SOURCE_TEXT_MAX)
}
