import { extractMainText } from '@/lib/ingest/html-clean'
import { assertSafeUrl } from '@/lib/ingest/ssrf'
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
const REDIRECTS = new Set([301, 302, 303, 307, 308])

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
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await (deps.limiter ?? defaultLimiter).wait(current.host)
    const res = await (deps.fetchImpl ?? fetch)(current, {
      redirect: 'manual',
      headers: { 'user-agent': REPUTATION_USER_AGENT, accept },
      signal: AbortSignal.timeout(deps.timeoutMs ?? SOURCE_TIMEOUT_MS),
    })
    if (!REDIRECTS.has(res.status)) return res
    const loc = res.headers.get('location')
    if (!loc) return res
    current = assertSafeUrl(new URL(loc, current).toString())
  }
  throw new Error('too many redirects')
}

async function readCapped(res: Response): Promise<string> {
  const text = await res.text()
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
