import { DISCOVERY_FETCH_TIMEOUT_MS, fetchWithTimeout } from '@/lib/net/timeout'

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
