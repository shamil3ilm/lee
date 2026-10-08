import { APP_NAME } from '@/lib/brand'
import { fetchWithTimeout } from '@/lib/net/timeout'
import { defaultLimiter, type HostLimiter } from './rate-limit'

/**
 * Outbound HTTP for reputation and AI Radar sources: an honest User-Agent
 * (Wikimedia's policy asks for contact details), a per-host rate limit, a
 * timeout and a response-size cap. Errors are plain `Error`s with a short,
 * safe message that the caller records per source.
 */

export const REPUTATION_USER_AGENT = `${APP_NAME}/1.0 (+https://getlee.vercel.app; personal job-search tool)`
export const REPUTATION_TIMEOUT_MS = 10_000
const MAX_BYTES = 512 * 1024
/** Feeds of the big labs run to ~0.8 MB; radar reads at most this much. */
export const MAX_FEED_BYTES = 2 * 1024 * 1024

export interface HttpDeps {
  fetchImpl?: typeof fetch
  limiter?: HostLimiter
  timeoutMs?: number
}

export interface ReadOptions {
  /** Accept header (default JSON). */
  accept?: string
  /** Response cap in characters (default 512 KB). */
  maxBytes?: number
}

export class SourceHttpError extends Error {
  constructor(
    readonly label: string,
    readonly status: number,
  ) {
    super(status === 429 ? `${label}: rate limited (429)` : `${label}: HTTP ${status}`)
    this.name = 'SourceHttpError'
  }
}

async function send(label: string, url: string, init: RequestInit, deps: HttpDeps, accept = 'application/json'): Promise<Response> {
  const host = new URL(url).host
  await (deps.limiter ?? defaultLimiter).wait(host)
  const headers = { accept, 'user-agent': REPUTATION_USER_AGENT, ...(init.headers ?? {}) }
  const full: RequestInit = { ...init, headers, redirect: 'follow' }
  const timeoutMs = deps.timeoutMs ?? REPUTATION_TIMEOUT_MS
  return deps.fetchImpl
    ? deps.fetchImpl(url, { ...full, signal: AbortSignal.timeout(timeoutMs) })
    : fetchWithTimeout(url, full, { timeoutMs, label })
}

/** Fetch and parse JSON; throws SourceHttpError on a non-2xx status. */
export async function requestJson(
  label: string,
  url: string,
  deps: HttpDeps = {},
  init: RequestInit = {},
  opts: ReadOptions = {},
): Promise<unknown> {
  const text = await requestText(label, url, deps, init, opts)
  // GDELT answers an empty body when nothing matched.
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`${label}: invalid JSON`)
  }
}

/** Fetch a body as text; throws SourceHttpError on a non-2xx status. */
export async function requestText(
  label: string,
  url: string,
  deps: HttpDeps = {},
  init: RequestInit = {},
  opts: ReadOptions = {},
): Promise<string> {
  const res = await send(label, url, init, deps, opts.accept)
  if (!res.ok) throw new SourceHttpError(label, res.status)
  const text = await res.text()
  if (text.length > (opts.maxBytes ?? MAX_BYTES)) throw new Error(`${label}: response too large`)
  return text
}

/** Short, safe message for the per-source status. */
export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/key=[^&\s]+/gi, 'key=***').slice(0, 200)
}
