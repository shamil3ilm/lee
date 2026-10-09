import { ATS_PROBE_TIMEOUT_MS, fetchWithTimeout } from '@/lib/net/timeout'

export type ATSKind = 'greenhouse' | 'lever' | 'ashby' | 'workable'
export type DetectedATS = { kind: ATSKind; slug: string } | null

interface Candidate {
  kind: ATSKind
  url: (slug: string) => string
}

const CANDIDATES: Candidate[] = [
  { kind: 'greenhouse', url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs` },
  { kind: 'lever', url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json` },
  { kind: 'ashby', url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}` },
  { kind: 'workable', url: (s) => `https://apply.workable.com/api/v3/accounts/${s}/jobs` },
]

export async function detectATSFromDomain(domain: string): Promise<DetectedATS> {
  const slug = slugFromDomain(domain)
  // The slug comes from a user-typed domain and goes into a fixed host's
  // path: one DNS-label-shaped token only, never path syntax.
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) return null
  for (const c of CANDIDATES) {
    try {
      const res = await fetchWithTimeout(
        c.url(slug),
        { method: 'GET' },
        { timeoutMs: ATS_PROBE_TIMEOUT_MS, label: `ats probe ${c.kind}` },
      )
      if (res.ok) return { kind: c.kind, slug }
    } catch {
      // Ignore network errors — treat as "not this ATS" and continue probing.
    }
  }
  return null
}

function slugFromDomain(domain: string): string {
  const host = domain.replace(/^www\./, '')
  const first = host.split('.')[0]
  return (first ?? host).toLowerCase()
}

// ---------------------------------------------------------------------------
// Board links on a careers page (company discovery). Pure: no request.
// ---------------------------------------------------------------------------

/**
 * A job board found in a link on a company's site. `watchable` boards map to
 * an existing source kind (the same public endpoints the sources use, see
 * docs/job-sources.md); the rest are recognised but stay links (their APIs
 * are disallowed by robots.txt, or lee has no reader for them).
 */
export type BoardKind =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'recruitee'
  | 'pinpoint'
  | 'workday'
  | 'teamtailor'
  | 'smartrecruiters'
  | 'bamboohr'
  | 'zoho'
  | 'other_ats'

export interface BoardRef {
  kind: BoardKind
  /** Board slug (or the Workday / Teamtailor feed URL for those kinds). */
  slug: string
  /** The board's public page, as linked. */
  url: string
  /** "Watch jobs" can add a source for it. */
  watchable: boolean
}

const BOARD_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const DNS_LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/

function firstSegment(u: URL): string {
  try {
    return decodeURIComponent(u.pathname.split('/').filter(Boolean)[0] ?? '')
  } catch {
    return ''
  }
}

function board(kind: BoardKind, slug: string, url: string, watchable: boolean): BoardRef | null {
  return slug ? { kind, slug, url, watchable } : null
}

function subdomainOf(host: string, suffix: string): string {
  if (!host.endsWith(`.${suffix}`)) return ''
  const label = host.slice(0, -suffix.length - 1)
  return DNS_LABEL.test(label) && label !== 'www' && label !== 'app' && label !== 'api' ? label : ''
}

/** The job board a link points at, or null for any other page. */
export function boardFromUrl(raw: string): BoardRef | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  const seg = firstSegment(u)
  const ok = (s: string): string => (BOARD_SLUG.test(s) ? s : '')
  const href = u.toString()
  if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host)) return board('greenhouse', ok(seg), href, true)
  if (/^jobs(\.eu)?\.lever\.co$/.test(host)) return board('lever', ok(seg), href, true)
  if (host === 'jobs.ashbyhq.com') return board('ashby', ok(seg), href, true)
  if (host === 'apply.workable.com') return board('workable', ok(seg), href, true)
  const recruitee = subdomainOf(host, 'recruitee.com')
  if (recruitee) return board('recruitee', recruitee, href, true)
  const pinpoint = subdomainOf(host, 'pinpointhq.com')
  if (pinpoint) return board('pinpoint', pinpoint, href, true)
  if (/^[a-z0-9-]+\.wd\d{1,3}\.myworkdayjobs\.com$/.test(host)) {
    const site = u.pathname.split('/').filter(Boolean).filter((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p))[0]
    return site && BOARD_SLUG.test(site) ? board('workday', `https://${host}/${site}`, href, true) : null
  }
  const teamtailor = subdomainOf(host, 'teamtailor.com')
  if (teamtailor) return board('teamtailor', `https://${host}/jobs.rss`, href, true)
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') return board('smartrecruiters', ok(seg), href, false)
  const bamboo = subdomainOf(host, 'bamboohr.com')
  if (bamboo) return board('bamboohr', bamboo, href, false)
  if (/(^|\.)zohorecruit\.(com|in|eu)$/.test(host)) return board('zoho', host, href, false)
  if (/(^|\.)(breezy\.hr|jobvite\.com|icims\.com|taleo\.net|successfactors\.(com|eu)|freshteam\.com|keka\.com|darwinbox\.in)$/.test(host)) {
    return board('other_ats', host, href, false)
  }
  return null
}

/** Source kind and config for a watchable board (what "Watch jobs" stores). */
export function boardSource(b: BoardRef): { kind: string; config: Record<string, unknown> } | null {
  if (!b.watchable) return null
  if (b.kind === 'workday') return { kind: 'workday', config: { url: b.slug } }
  if (b.kind === 'teamtailor') return { kind: 'rss', config: { url: b.slug } }
  return { kind: b.kind, config: { company: b.slug } }
}

export const BOARD_LABELS: Readonly<Record<BoardKind, string>> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  recruitee: 'Recruitee',
  pinpoint: 'Pinpoint',
  workday: 'Workday',
  teamtailor: 'Teamtailor',
  smartrecruiters: 'SmartRecruiters',
  bamboohr: 'BambooHR',
  zoho: 'Zoho Recruit',
  other_ats: 'Job board',
}
