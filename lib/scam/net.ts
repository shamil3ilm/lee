import { assertSafeUrl } from '@/lib/ingest/ssrf'

/**
 * v17 §1 — optional, zero-cost network checks for Scam Shield:
 *   - domain age via RDAP (the free rdap.org bootstrap redirector)
 *   - MX presence via DNS-over-HTTPS (Cloudflare JSON API)
 *
 * Contract: these functions NEVER throw and never report "risky" on
 * failure — a timeout, a 5xx, a malformed body or a blocked redirect all
 * come back as `{ status: 'error' }`, which the rules treat as unknown.
 * Every hop goes through the SSRF guard from lib/ingest (https only, no
 * private/loopback IPs, re-checked on each redirect).
 */

export const RDAP_BASE = 'https://rdap.org/domain/'
export const DOH_URL = 'https://cloudflare-dns.com/dns-query'
export const DEFAULT_TIMEOUT_MS = 4000
const MAX_BYTES = 256 * 1024
const MAX_REDIRECTS = 3
const REDIRECTS = new Set([301, 302, 303, 307, 308])

export interface NetDeps {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type AgeLookup =
  | { status: 'ok'; registeredAt: string }
  | { status: 'not_found' }
  | { status: 'error'; reason: string }

export type MxLookup = { status: 'ok'; hasMx: boolean } | { status: 'error'; reason: string }

const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** ASCII registrable-looking domain; anything else is never sent anywhere. */
export function isLookupableDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain)
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`http ${status}`)
  }
}

function reasonOf(e: unknown): string {
  if (e instanceof HttpError) return e.message
  if (e instanceof Error) return e.name === 'AbortError' ? 'timeout' : e.message.slice(0, 120)
  return 'unknown error'
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return await res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BYTES) {
      await reader.cancel()
      throw new Error('response too large')
    }
    chunks.push(value)
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks))
}

/**
 * GET a JSON document through the SSRF guard with a hard timeout. The
 * timeout races the whole exchange (a fetch that ignores AbortSignal still
 * cannot hang the pipeline). Throws; public helpers below catch.
 */
export async function fetchJsonSafe(url: string, accept: string, deps: NetDeps = {}): Promise<unknown> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      const err = new Error('timeout')
      err.name = 'AbortError'
      reject(err)
    }, timeoutMs)
  })
  const work = (async (): Promise<unknown> => {
    let current = assertSafeUrl(url)
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetchImpl(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { accept, 'user-agent': 'employ-app/0.1 (+personal-tool)' },
      })
      if (REDIRECTS.has(res.status)) {
        const loc = res.headers.get('location')
        if (!loc) throw new HttpError(res.status)
        current = assertSafeUrl(new URL(loc, current).toString())
        continue
      }
      if (!res.ok) throw new HttpError(res.status)
      return JSON.parse(await readCapped(res)) as unknown
    }
    throw new Error('too many redirects')
  })()
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
    work.catch(() => undefined)
  }
}

interface RdapEvent {
  eventAction?: unknown
  eventDate?: unknown
}

export async function lookupDomainAge(domain: string, deps: NetDeps = {}): Promise<AgeLookup> {
  if (!isLookupableDomain(domain)) return { status: 'error', reason: 'invalid domain' }
  try {
    const body = (await fetchJsonSafe(
      `${RDAP_BASE}${encodeURIComponent(domain)}`,
      'application/rdap+json, application/json',
      deps,
    )) as { events?: unknown }
    const events = Array.isArray(body?.events) ? (body.events as RdapEvent[]) : []
    const reg = events.find((e) => e.eventAction === 'registration' && typeof e.eventDate === 'string')
    const date = reg ? new Date(reg.eventDate as string) : null
    if (!date || Number.isNaN(date.getTime())) return { status: 'error', reason: 'no registration event' }
    return { status: 'ok', registeredAt: date.toISOString() }
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return { status: 'not_found' }
    return { status: 'error', reason: reasonOf(e) }
  }
}

interface DohAnswer {
  type?: unknown
  data?: unknown
}

export async function lookupMx(domain: string, deps: NetDeps = {}): Promise<MxLookup> {
  if (!isLookupableDomain(domain)) return { status: 'error', reason: 'invalid domain' }
  try {
    const url = `${DOH_URL}?name=${encodeURIComponent(domain)}&type=MX`
    const body = (await fetchJsonSafe(url, 'application/dns-json', deps)) as {
      Status?: unknown
      Answer?: unknown
    }
    // 3 = NXDOMAIN: the domain does not exist, so it certainly has no MX.
    if (body?.Status === 3) return { status: 'ok', hasMx: false }
    if (body?.Status !== 0) return { status: 'error', reason: `dns status ${String(body?.Status)}` }
    const answers = Array.isArray(body.Answer) ? (body.Answer as DohAnswer[]) : []
    // RFC 7505 "null MX" (`0 .`) explicitly says the domain accepts no mail.
    const usable = answers.filter(
      (a) => a.type === 15 && typeof a.data === 'string' && !/^\s*0\s+\.\s*$/.test(a.data),
    )
    return { status: 'ok', hasMx: usable.length > 0 }
  } catch (e) {
    return { status: 'error', reason: reasonOf(e) }
  }
}

export function ageInDays(registeredAt: string | null, now: Date): number | null {
  if (!registeredAt) return null
  const t = new Date(registeredAt).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}
