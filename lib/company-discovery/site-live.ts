import { companyGet, type CompanyHttpDeps } from './http'

/**
 * SERVER-ONLY. The website liveness check: one GET of the home page through
 * safeFetch (SSRF-guarded, 256 KB cap, 3 redirects, 8 s), body discarded.
 * Live = any answer below 400, or 403 (a bot wall still means the site
 * exists). Shared by "Find a company by name" (website guesses) and the
 * enrichment of map and register listings.
 */
export async function siteIsLive(domain: string, deps: CompanyHttpDeps = {}): Promise<boolean> {
  try {
    const res = await companyGet('company-guess', `https://${domain}/`, { ...deps, timeoutMs: deps.timeoutMs ?? 8_000 }, { accept: 'text/html', maxBytes: 256 * 1024, maxRedirects: 3 })
    void res.body?.cancel().catch(() => undefined)
    return res.status < 400 || res.status === 403
  } catch {
    return false
  }
}
