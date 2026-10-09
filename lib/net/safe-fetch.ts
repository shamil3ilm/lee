import { Agent, fetch as undiciFetch } from 'undici'
import { assertSafeUrl, netHooks, resolveSafeHost, UnsafeUrlError, type ResolvedAddress } from './ssrf'
import { isTimeoutError, timeoutError, timeoutSignal } from './timeout'

/**
 * The one fetch for every URL that comes from a user or a third party
 * (a configured feed, a pasted link, a link inside a fetched page). See
 * lib/net/ssrf.ts for what is checked. On top of the checks this:
 *
 * - **pins** the connection to the address that was vetted (an undici Agent
 *   whose `lookup` returns that address), so a DNS answer that changes
 *   between check and connect (rebinding) cannot reach an internal host;
 *   TLS still verifies the certificate for the original host name;
 * - follows redirects **manually**, re-checking and re-pinning every hop,
 *   at most `maxRedirects` hops; credentials are dropped on a cross-origin
 *   hop, and 303 (or 301/302 after a POST) switches to a body-less GET;
 * - caps the response body at `maxBytes` (the stream errors past it);
 * - applies a per-request timeout (the timeout also bounds the body read).
 *
 * Fixed-host API calls (Google, GitHub, AI providers, …) don't need this and
 * use `fetchWithTimeout`. tests/unit/outbound-fetch-guard.test.ts fails when a
 * listed variable-host module calls `fetch` directly.
 */

export const SAFE_FETCH_DEFAULT_MAX_BYTES = 5 * 1024 * 1024
export const SAFE_FETCH_DEFAULT_MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

type FetchLike = (input: string, init: RequestInit & { dispatcher?: unknown }) => Promise<Response>

export interface SafeFetchOptions {
  timeoutMs: number
  label: string
  /** Body cap in bytes (default 5 MB). */
  maxBytes?: number
  /** Redirect hops allowed (default 5); 0 refuses any redirect. */
  maxRedirects?: number
  /** Only https (default false). */
  httpsOnly?: boolean
  /**
   * Injected transport (tests and callers with their own fetch seam). The
   * SSRF checks and DNS resolution still run; only the pinned dispatcher is
   * ignored by a transport that doesn't understand it.
   */
  fetchImpl?: typeof fetch
}

/** `dns.lookup`-shaped function that always answers with the vetted address. */
export function pinnedLookup(addr: ResolvedAddress) {
  return (
    _hostname: string,
    options: { all?: boolean } | number | undefined,
    callback: (err: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void,
  ): void => {
    if (typeof options === 'object' && options?.all) callback(null, [{ address: addr.address, family: addr.family }])
    else callback(null, addr.address, addr.family)
  }
}

function pinnedAgent(addr: ResolvedAddress): Agent {
  return new Agent({
    connect: { lookup: pinnedLookup(addr) as never },
    keepAliveTimeout: 1_000,
    keepAliveMaxTimeout: 1_000,
  })
}

interface TransportHooks {
  transport?: FetchLike
}

function transportFor(opts: SafeFetchOptions): FetchLike {
  if (opts.fetchImpl) return opts.fetchImpl as unknown as FetchLike
  const hooked = (netHooks() as TransportHooks).transport
  if (hooked) return hooked
  return undiciFetch as unknown as FetchLike
}

function capBody(res: Response, maxBytes: number, label: string): Response {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    void res.body?.cancel().catch(() => undefined)
    throw new Error(`${label}: response too large (${declared} bytes)`)
  }
  if (!res.body) return res
  let total = 0
  const capped = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength
        if (total > maxBytes) {
          controller.error(new Error(`${label}: response too large (> ${maxBytes} bytes)`))
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
  const out = new Response(capped, { status: res.status, statusText: res.statusText, headers: res.headers })
  Object.defineProperty(out, 'url', { value: res.url })
  return out
}

function stripCredentials(headers: Headers): Headers {
  const h = new Headers(headers)
  h.delete('authorization')
  h.delete('cookie')
  h.delete('proxy-authorization')
  return h
}

/**
 * Fetch a user- or third-party-supplied URL safely. Throws `UnsafeUrlError`
 * for a blocked target (first URL or any redirect hop).
 */
export async function safeFetch(input: string | URL, init: RequestInit, opts: SafeFetchOptions): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? SAFE_FETCH_DEFAULT_MAX_REDIRECTS
  const maxBytes = opts.maxBytes ?? SAFE_FETCH_DEFAULT_MAX_BYTES
  const signal = timeoutSignal(opts.timeoutMs, init.signal)
  const transport = transportFor(opts)

  let url = assertSafeUrl(input, { httpsOnly: opts.httpsOnly })
  let method = (init.method ?? 'GET').toUpperCase()
  let body = init.body
  let headers = new Headers(init.headers)

  for (let hop = 0; ; hop++) {
    const [addr] = await resolveSafeHost(url)
    if (!addr) throw new UnsafeUrlError(`no address for ${url.hostname}`)
    const dispatcher = pinnedAgent(addr)
    let res: Response
    try {
      // Plain-object headers: what every fetch implementation (and test
      // double) understands.
      const plainHeaders = Object.fromEntries(headers.entries())
      res = await transport(url.toString(), { ...init, method, body, headers: plainHeaders, redirect: 'manual', signal, dispatcher })
    } catch (e) {
      void dispatcher.close().catch(() => undefined)
      if (isTimeoutError(e)) throw timeoutError(opts.label, opts.timeoutMs, e)
      throw e
    }
    const location = REDIRECT_STATUSES.has(res.status) ? res.headers.get('location') : null
    if (!location) return capBody(res, maxBytes, opts.label)

    void res.body?.cancel().catch(() => undefined)
    if (hop >= maxRedirects) throw new UnsafeUrlError(`${opts.label}: too many redirects`)
    const next = assertSafeUrl(new URL(location, url), { httpsOnly: opts.httpsOnly })
    if (next.origin !== url.origin) headers = stripCredentials(headers)
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      method = 'GET'
      body = undefined
      headers.delete('content-type')
      headers.delete('content-length')
    }
    url = next
  }
}

/** `safeFetch` + read the (capped) body as text. */
export async function safeFetchText(
  input: string | URL,
  init: RequestInit,
  opts: SafeFetchOptions,
): Promise<{ text: string; status: number; finalUrl: string; headers: Headers }> {
  const res = await safeFetch(input, init, opts)
  const text = await res.text()
  return { text, status: res.status, finalUrl: res.url || input.toString(), headers: res.headers }
}
