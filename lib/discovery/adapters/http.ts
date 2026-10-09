import { DISCOVERY_FETCH_TIMEOUT_MS, fetchWithTimeout } from '@/lib/net/timeout'
import { safeFetch } from '@/lib/net/safe-fetch'

/**
 * Honest User-Agent for every discovery request: says what lee is and how
 * often it calls. Adapters may override it per call.
 */
export const DISCOVERY_USER_AGENT = 'lee/1.5 (personal job tracker; polls each source about once a day)'

/**
 * `fetch` for discovery adapters: every source request is bounded by
 * DISCOVERY_FETCH_TIMEOUT_MS (override per call, e.g. HN item fetches). A
 * timeout throws a plain Error ("<label> timed out after <n>ms"), which the
 * discovery service already records as a per-source failure.
 */
export function discoveryFetch(
  label: string,
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DISCOVERY_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('user-agent')) headers.set('user-agent', DISCOVERY_USER_AGENT)
  return fetchWithTimeout(url, { ...init, headers }, { timeoutMs, label })
}

/** Body cap for a user-configured source (feeds and careers pages are far smaller). */
export const UNTRUSTED_SOURCE_MAX_BYTES = 10 * 1024 * 1024

/**
 * `discoveryFetch` for a source whose URL or host the user typed (RSS,
 * JSON-LD, Workday, Oracle ORC, SuccessFactors, Phenom): goes through the
 * SSRF guard (lib/net/safe-fetch.ts) — DNS-checked, connection pinned,
 * redirects re-checked and capped, body capped. Fixed-host adapters
 * (greenhouse, lever, …) keep `discoveryFetch`.
 */
export function untrustedDiscoveryFetch(
  label: string,
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DISCOVERY_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('user-agent')) headers.set('user-agent', DISCOVERY_USER_AGENT)
  return safeFetch(url, { ...init, headers }, { timeoutMs, label, maxBytes: UNTRUSTED_SOURCE_MAX_BYTES })
}
