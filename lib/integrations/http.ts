import { fetchWithTimeout } from '@/lib/net/timeout'

/**
 * SERVER-ONLY. Outbound calls to GitHub and LinkedIn. SSRF-safe by
 * construction: a request is only sent when its URL starts with one of
 * the configured provider bases the caller passes (lib/integrations/config.ts
 * — fixed hosts, overrides https-only in production), redirects are never
 * followed, and every call has a hard timeout. Tokens only ever travel in
 * headers or form bodies: errors carry the HTTP status, never a body, URL
 * query or header.
 */

export const INTEGRATION_TIMEOUT_MS = 10_000

export class IntegrationHttpError extends Error {
  constructor(
    readonly label: string,
    readonly status: number | null,
  ) {
    super(status === null ? `${label} unreachable` : `${label} answered ${status}`)
    this.name = 'IntegrationHttpError'
  }
}

export function assertAllowedUrl(url: string, bases: readonly string[]): URL {
  const u = new URL(url)
  const ok = bases.some((b) => {
    const base = new URL(b)
    return u.origin === base.origin && u.pathname.startsWith(base.pathname.replace(/\/$/, '') || '/')
  })
  if (!ok) throw new Error('integration request outside the configured provider hosts')
  return u
}

export interface IntegrationRequest {
  bases: readonly string[]
  label: string
  init?: RequestInit
  timeoutMs?: number
}

/** fetch with host allow-list, no redirects and a timeout; network failures → IntegrationHttpError(null). */
export async function integrationFetch(url: string, req: IntegrationRequest): Promise<Response> {
  assertAllowedUrl(url, req.bases)
  try {
    return await fetchWithTimeout(
      url,
      { ...req.init, redirect: 'manual' },
      { timeoutMs: req.timeoutMs ?? INTEGRATION_TIMEOUT_MS, label: req.label },
    )
  } catch {
    throw new IntegrationHttpError(req.label, null)
  }
}

/** JSON body of a 2xx answer; anything else → IntegrationHttpError(status). */
export async function integrationJson<T>(url: string, req: IntegrationRequest): Promise<{ body: T; res: Response }> {
  const res = await integrationFetch(url, req)
  if (!res.ok) throw new IntegrationHttpError(req.label, res.status)
  try {
    return { body: (await res.json()) as T, res }
  } catch {
    throw new IntegrationHttpError(req.label, res.status)
  }
}
