import { createHash } from 'node:crypto'
import { logger } from '@/lib/logger'
import { safeFetchText } from '@/lib/net/safe-fetch'
import { GITHUB_TIMEOUT_MS } from '@/lib/net/timeout'
import { getFile, GitHubError } from './github'
import type { JsonDoc } from './map'
import { loadPublishContext } from './publish'

/**
 * SERVER-ONLY. Where lee reads the portfolio's profile.json from:
 *
 *  1. the repository, through the GitHub contents API, exactly as Publish
 *     reads it (configured repo / branch / path; the Connect GitHub
 *     installation token, else the fine-grained token or the owner's env
 *     fallback) — the sha is the blob sha;
 *  2. otherwise the live site: `<canonical origin>/profile.json`, where the
 *     canonical URL is the one in the profile's portfolio settings. Only
 *     that host, https only, no redirects, through the SSRF-guarded fetch.
 *     The "sha" is `site:<sha1 of the body>`.
 */

export type PortfolioSource =
  | { kind: 'ok'; via: 'github' | 'site'; sha: string; doc: JsonDoc }
  | { kind: 'missing'; via: 'github' }
  | { kind: 'error'; via: 'github' | 'site'; error: string }
  | { kind: 'off' }

const SITE_MAX_BYTES = 1024 * 1024

function parseDoc(text: string): JsonDoc | null {
  try {
    const v = JSON.parse(text) as unknown
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as JsonDoc) : null
  } catch {
    return null
  }
}

/** `https://you.example.dev/profile.json` from the canonical URL, or null when it is not an https URL. */
export function siteProfileUrl(canonical: string): string | null {
  try {
    const u = new URL(canonical)
    return u.protocol === 'https:' ? new URL('/profile.json', u.origin).toString() : null
  } catch {
    return null
  }
}

async function fromGitHub(userId: string, now: Date): Promise<PortfolioSource | null> {
  const ctx = await loadPublishContext(userId, now)
  if ('error' in ctx) return null
  try {
    const remote = await getFile(ctx.target, ctx.token)
    if (!remote.exists) return { kind: 'missing', via: 'github' }
    const doc = parseDoc(remote.text)
    return doc
      ? { kind: 'ok', via: 'github', sha: remote.sha, doc }
      : { kind: 'error', via: 'github', error: 'profile.json in the repository is not valid JSON.' }
  } catch (err) {
    if (err instanceof GitHubError) return { kind: 'error', via: 'github', error: err.message }
    throw err
  }
}

async function fromSite(canonical: string): Promise<PortfolioSource | null> {
  const url = siteProfileUrl(canonical)
  if (!url) return null
  try {
    const res = await safeFetchText(
      url,
      { headers: { accept: 'application/json' } },
      { timeoutMs: GITHUB_TIMEOUT_MS, label: 'portfolio-site', httpsOnly: true, maxRedirects: 0, maxBytes: SITE_MAX_BYTES },
    )
    if (res.status !== 200) return { kind: 'error', via: 'site', error: `Your portfolio site answered ${res.status} for profile.json.` }
    const doc = parseDoc(res.text)
    if (!doc) return { kind: 'error', via: 'site', error: 'profile.json on your portfolio site is not valid JSON.' }
    return { kind: 'ok', via: 'site', sha: `site:${createHash('sha1').update(res.text).digest('hex')}`, doc }
  } catch (err) {
    logger.warn('portfolio_site_fetch_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { kind: 'error', via: 'site', error: 'Could not reach your portfolio site.' }
  }
}

/**
 * The portfolio's current profile.json. The repository first; the site
 * when no repository/token is set or GitHub fails. `off` when neither is
 * configured.
 */
export async function readPortfolioSource(userId: string, canonical: string, now: Date = new Date()): Promise<PortfolioSource> {
  const github = await fromGitHub(userId, now)
  if (github && github.kind !== 'error') return github
  const site = await fromSite(canonical)
  if (site?.kind === 'ok') return site
  return github ?? site ?? { kind: 'off' }
}
