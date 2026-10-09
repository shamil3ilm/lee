import { safeFetch } from '@/lib/net/safe-fetch'
import { createHostLimiter, HOST_INTERVALS_MS, type HostLimiter } from '@/lib/reputation/rate-limit'
import { REPUTATION_USER_AGENT } from '@/lib/reputation/http'

/**
 * SERVER-ONLY. Every company-discovery request: through the SSRF guard
 * (`safeFetch`: DNS-checked, pinned, redirects re-checked, body capped),
 * with an honest User-Agent (Wikimedia asks for contact details), a
 * per-host spacing and a timeout. Tests inject `fetchImpl` and a no-wait
 * limiter.
 */

export const COMPANY_USER_AGENT = REPUTATION_USER_AGENT
export const COMPANY_TIMEOUT_MS = 15_000

/** Published limits with headroom: WDQS asks for one query at a time; GitHub search 10/min unauthenticated. */
const INTERVALS: Readonly<Record<string, number>> = {
  ...HOST_INTERVALS_MS,
  'query.wikidata.org': 2_000,
  'yc-oss.github.io': 1_000,
}

export const companyLimiter: HostLimiter = createHostLimiter({ intervals: INTERVALS, defaultIntervalMs: 1_000 })

export interface CompanyHttpDeps {
  fetchImpl?: typeof fetch
  limiter?: HostLimiter
  timeoutMs?: number
  /** GitHub token (the user's connection or the deployment's GITHUB_TOKEN). */
  githubToken?: string | null
}

export class CompanyHttpError extends Error {
  constructor(
    readonly label: string,
    readonly status: number,
  ) {
    super(status === 429 || status === 403 ? `${label}: rate limited (${status})` : `${label}: HTTP ${status}`)
    this.name = 'CompanyHttpError'
  }
}

export interface GetOptions {
  accept?: string
  maxBytes?: number
  headers?: Record<string, string>
  /** Redirect hops (default 3). */
  maxRedirects?: number
}

/** GET a URL; resolves with the response (status not checked). */
export async function companyGet(label: string, url: string, deps: CompanyHttpDeps = {}, opts: GetOptions = {}): Promise<Response> {
  const host = new URL(url).host
  await (deps.limiter ?? companyLimiter).wait(host)
  return safeFetch(
    url,
    { method: 'GET', headers: { accept: opts.accept ?? 'application/json', 'user-agent': COMPANY_USER_AGENT, ...(opts.headers ?? {}) } },
    {
      label,
      timeoutMs: deps.timeoutMs ?? COMPANY_TIMEOUT_MS,
      maxBytes: opts.maxBytes ?? 1024 * 1024,
      maxRedirects: opts.maxRedirects ?? 3,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    },
  )
}

/** GET and parse JSON; throws CompanyHttpError on a non-2xx status. */
export async function companyJson(label: string, url: string, deps: CompanyHttpDeps = {}, opts: GetOptions = {}): Promise<unknown> {
  const res = await companyGet(label, url, deps, opts)
  if (!res.ok) {
    void res.body?.cancel().catch(() => undefined)
    throw new CompanyHttpError(label, res.status)
  }
  const text = await res.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`${label}: invalid JSON`)
  }
}

/** Short, safe message for run summaries and logs. */
export function companyErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/(token|key)=[^&\s]+/gi, '$1=***').slice(0, 160)
}
