import { parseWorkdayUrl } from '@/lib/discovery/adapters/workday'
import { BOARD_SLUG_RE } from '@/lib/discovery/source-kinds'

/**
 * Which ATS a posting link belongs to, and how to read it through lee's
 * EXISTING adapter for that ATS (the same public job-board endpoints the
 * sources use, listed in docs/job-sources.md). Pure: no request here.
 *
 * SmartRecruiters is recognised but never read: api.smartrecruiters.com's
 * robots.txt disallows every crawler except LinkedIn's, so its links stay
 * links. Every other host is link-only too: lee never fetches a pasted page.
 */

export type AtsKind = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'workday'

export interface AtsRoute {
  kind: AtsKind
  /** Adapter config, exactly what a source of this kind stores. */
  config: Record<string, unknown>
  /** One board per (kind, board): fetched once per import. */
  boardKey: string
  /** The posting's id on that board (matched against the adapter's items). */
  jobKey: string
}

export type LinkRoute =
  | { type: 'ats'; route: AtsRoute }
  | { type: 'link'; reason: 'smartrecruiters' | 'not_ats' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function segments(u: URL): string[] {
  return u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s))
}

function route(kind: AtsKind, slug: string, jobKey: string): LinkRoute | null {
  if (!BOARD_SLUG_RE.test(slug) || !jobKey) return null
  return { type: 'ats', route: { kind, config: { company: slug }, boardKey: `${kind}:${slug.toLowerCase()}`, jobKey } }
}

/** boards.greenhouse.io/{slug}/jobs/{id}, job-boards[.eu].greenhouse.io/{slug}/jobs/{id} */
function greenhouse(u: URL, host: string): LinkRoute | null {
  if (!/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host)) return null
  const [slug, jobs, id] = segments(u)
  return jobs === 'jobs' && slug && id && /^\d{3,}$/.test(id) ? route('greenhouse', slug, id) : null
}

/** jobs[.eu].lever.co/{slug}/{uuid}[/apply] */
function lever(u: URL, host: string): LinkRoute | null {
  if (!/^jobs(\.eu)?\.lever\.co$/.test(host)) return null
  const [slug, id] = segments(u)
  return slug && id && UUID_RE.test(id) ? route('lever', slug, id.toLowerCase()) : null
}

/** jobs.ashbyhq.com/{slug}/{uuid}[/application] */
function ashby(u: URL, host: string): LinkRoute | null {
  if (host !== 'jobs.ashbyhq.com') return null
  const [slug, id] = segments(u)
  return slug && id && UUID_RE.test(id) ? route('ashby', slug, id.toLowerCase()) : null
}

/** apply.workable.com/{slug}/j/{shortcode} */
function workable(u: URL, host: string): LinkRoute | null {
  if (host !== 'apply.workable.com') return null
  const [slug, j, code] = segments(u)
  return j === 'j' && slug && code && /^[A-Z0-9]{4,20}$/i.test(code) ? route('workable', slug, code.toUpperCase()) : null
}

/** {tenant}.wd{N}.myworkdayjobs.com[/{locale}]/{site}/job/{…} */
function workday(u: URL): LinkRoute | null {
  const site = parseWorkdayUrl(u.toString())
  if (!site) return null
  const parts = u.pathname.split('/')
  const at = parts.indexOf('job')
  if (at < 0) return null
  const externalPath = `/${parts.slice(at).join('/')}`.replace(/\/+$/, '')
  if (externalPath.split('/').length < 3) return null
  return {
    type: 'ats',
    route: {
      kind: 'workday',
      config: { url: `https://${site.host}/${site.site}` },
      boardKey: `workday:${site.host}/${site.site.toLowerCase()}`,
      jobKey: externalPath,
    },
  }
}

export function routeLink(url: string): LinkRoute {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { type: 'link', reason: 'not_ats' }
  }
  const host = u.hostname.toLowerCase()
  if (/(^|\.)smartrecruiters\.com$/.test(host)) return { type: 'link', reason: 'smartrecruiters' }
  if (u.protocol !== 'https:') return { type: 'link', reason: 'not_ats' }
  return greenhouse(u, host) ?? lever(u, host) ?? ashby(u, host) ?? workable(u, host) ?? workday(u) ?? { type: 'link', reason: 'not_ats' }
}
