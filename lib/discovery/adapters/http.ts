import { DISCOVERY_FETCH_TIMEOUT_MS, fetchWithTimeout } from '@/lib/net/timeout'

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
  return fetchWithTimeout(url, init, { timeoutMs, label })
}
