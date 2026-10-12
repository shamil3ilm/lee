// ---------------------------------------------------------------------------
// Board links on a careers page or in a news post (company discovery, job
// news roundups). Pure: no request. Client-safe.
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
  | 'bamboohr'
  | 'oracle_orc'
  | 'smartrecruiters'
  | 'personio'
  | 'zoho'
  | 'taleo'
  | 'successfactors'
  | 'icims'
  | 'jazzhr'
  | 'breezy'
  | 'freshteam'
  | 'manatal'
  | 'other_ats'

/** Boards lee reads through an adapter ("Watch jobs" / "Turn on"). */
export const READABLE_BOARD_KINDS: readonly BoardKind[] = [
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'recruitee',
  'pinpoint',
  'workday',
  'teamtailor',
  'bamboohr',
  'oracle_orc',
]

export function isReadableBoard(kind: string | null | undefined): kind is BoardKind {
  return !!kind && (READABLE_BOARD_KINDS as readonly string[]).includes(kind)
}

export interface BoardRef {
  kind: BoardKind
  /**
   * Board slug; the Workday site URL, the Teamtailor feed URL, or
   * "{host}/{siteNumber}" for Oracle Recruiting Cloud.
   */
  slug: string
  /** The board's public page, as linked. */
  url: string
  /** "Watch jobs" can add a source for it. */
  watchable: boolean
  /** The one opening the link points at, when it names one (BambooHR /careers/479). */
  jobId?: string
}

const BOARD_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const DNS_LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/
const RESERVED_LABELS = new Set(['www', 'app', 'api', 'cdn', 'static', 'assets', 'help', 'support', 'status', 'blog', 'resources', 'partners', 'marketplace', 'community', 'docs', 'go', 'info', 'marketing'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function segments(u: URL): string[] {
  try {
    return u.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p))
  } catch {
    return []
  }
}

function board(kind: BoardKind, slug: string, url: string, jobId?: string): BoardRef | null {
  if (!slug) return null
  return { kind, slug, url, watchable: isReadableBoard(kind), ...(jobId ? { jobId } : {}) }
}

function subdomainOf(host: string, suffix: string): string {
  if (!host.endsWith(`.${suffix}`)) return ''
  const label = host.slice(0, -suffix.length - 1)
  return DNS_LABEL.test(label) && !RESERVED_LABELS.has(label) ? label : ''
}

/** boards.greenhouse.io/{slug}[/jobs/{id}], and the embed script (…/embed/job_board/js?for={slug}). */
function greenhouse(u: URL, host: string, href: string): BoardRef | null | undefined {
  if (!/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host)) return undefined
  const seg = segments(u)
  if (seg[0] === 'embed') {
    const slug = u.searchParams.get('for') ?? ''
    return BOARD_SLUG.test(slug) ? board('greenhouse', slug, href) : null
  }
  const slug = seg[0] ?? ''
  const id = seg[1] === 'jobs' && /^\d{3,}$/.test(seg[2] ?? '') ? seg[2] : undefined
  return BOARD_SLUG.test(slug) ? board('greenhouse', slug, href, id) : null
}

/** Oracle Recruiting Cloud: {host}/hcmUI/CandidateExperience/{locale}/sites/{siteNumber}[/job/{id}]. */
function oracleOrc(u: URL, host: string, href: string): BoardRef | null | undefined {
  if (!/\.oraclecloud\d*\.com$/.test(host)) return undefined
  const seg = segments(u)
  const at = seg.indexOf('sites')
  const site = at >= 0 ? (seg[at + 1] ?? '') : ''
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(site)) return { kind: 'oracle_orc', slug: host, url: href, watchable: false }
  const id = seg[at + 2] === 'job' && /^\d{1,12}$/.test(seg[at + 3] ?? '') ? seg[at + 3] : undefined
  return board('oracle_orc', `${host}/${site}`, href, id)
}

/** /careers, /careers/{id}, /jobs/view.php?id={id}, /js/embed.js on {slug}.bamboohr.com. */
function bamboo(u: URL, slug: string, href: string): BoardRef | null {
  const seg = segments(u)
  const viewId = u.searchParams.get('id') ?? ''
  const id =
    seg[0] === 'careers' && /^\d{1,9}$/.test(seg[1] ?? '')
      ? seg[1]
      : seg[0] === 'jobs' && /^\d{1,9}$/.test(viewId)
        ? viewId
        : undefined
  return board('bamboohr', slug, href, id)
}

const LINK_ONLY: ReadonlyArray<readonly [RegExp, BoardKind]> = [
  [/(^|\.)zohorecruit\.(com|in|eu)$/, 'zoho'],
  [/(^|\.)taleo\.net$/, 'taleo'],
  [/(^|\.)successfactors\.(com|eu)$|(^|\.)sapsf\.(com|eu)$/, 'successfactors'],
  [/(^|\.)icims\.com$/, 'icims'],
  [/(^|\.)(applytojob|jazzhr)\.com$/, 'jazzhr'],
  [/(^|\.)breezy\.hr$/, 'breezy'],
  [/(^|\.)freshteam\.com$/, 'freshteam'],
  [/(^|\.)manatal\.com$|^(www\.)?careers-page\.com$/, 'manatal'],
  [/(^|\.)(jobvite\.com|keka\.com|darwinbox\.in)$/, 'other_ats'],
]

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
  const seg = segments(u)
  const first = seg[0] ?? ''
  const ok = (s: string): string => (BOARD_SLUG.test(s) ? s : '')
  const href = u.toString()
  const gh = greenhouse(u, host, href)
  if (gh !== undefined) return gh
  if (/^jobs(\.eu)?\.lever\.co$/.test(host)) return board('lever', ok(first), href, UUID.test(seg[1] ?? '') ? seg[1]!.toLowerCase() : undefined)
  if (host === 'jobs.ashbyhq.com') return board('ashby', ok(first), href, UUID.test(seg[1] ?? '') ? seg[1]!.toLowerCase() : undefined)
  if (host === 'apply.workable.com') {
    return board('workable', ok(first), href, seg[1] === 'j' && /^[A-Z0-9]{4,20}$/i.test(seg[2] ?? '') ? seg[2]!.toUpperCase() : undefined)
  }
  const recruitee = subdomainOf(host, 'recruitee.com')
  if (recruitee) return board('recruitee', recruitee, href, first === 'o' && seg[1] ? seg[1] : undefined)
  const pinpoint = subdomainOf(host, 'pinpointhq.com')
  if (pinpoint) return board('pinpoint', pinpoint, href)
  if (/^[a-z0-9-]+\.wd\d{1,3}\.myworkdayjobs\.com$/.test(host)) {
    const site = seg.filter((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p))[0]
    return site && BOARD_SLUG.test(site) ? board('workday', `https://${host}/${site}`, href) : null
  }
  const teamtailor = subdomainOf(host, 'teamtailor.com')
  if (teamtailor) return board('teamtailor', `https://${host}/jobs.rss`, href)
  const bambooSlug = subdomainOf(host, 'bamboohr.com')
  if (bambooSlug) return bamboo(u, bambooSlug, href)
  const orc = oracleOrc(u, host, href)
  if (orc !== undefined) return orc
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') return board('smartrecruiters', ok(first), href)
  const personio = subdomainOf(host, 'jobs.personio.de') || subdomainOf(host, 'jobs.personio.com')
  if (personio) return board('personio', personio, href)
  for (const [re, kind] of LINK_ONLY) if (re.test(host)) return board(kind, host, href)
  return null
}

/**
 * Source kind and config for a readable board (what "Watch jobs" stores).
 * `companyName` names the employer for boards whose API does not (BambooHR,
 * Oracle Recruiting Cloud).
 */
export function boardSource(b: BoardRef, companyName?: string): { kind: string; config: Record<string, unknown> } | null {
  if (!b.watchable || !isReadableBoard(b.kind)) return null
  const name = companyName?.trim().slice(0, 100)
  if (b.kind === 'workday') return { kind: 'workday', config: { url: b.slug } }
  if (b.kind === 'teamtailor') return { kind: 'rss', config: { url: b.slug } }
  if (b.kind === 'oracle_orc') {
    const [host, siteNumber] = b.slug.split('/')
    return host && siteNumber ? { kind: 'oracle_orc', config: { host, siteNumber, displayName: name || host } } : null
  }
  if (b.kind === 'bamboohr') return { kind: 'bamboohr', config: { company: b.slug, ...(name ? { displayName: name } : {}) } }
  return { kind: b.kind, config: { company: b.slug } }
}

/** True when `config` (a stored source's) reads the same board as `b`. */
export function sameBoard(b: { kind: string; config: Record<string, unknown> }, kind: string, config: Record<string, unknown>): boolean {
  if (b.kind !== kind) return false
  const keys = ['company', 'url', 'host', 'siteNumber'].filter((k) => k in b.config)
  return keys.length > 0 && keys.every((k) => String(b.config[k] ?? '').toLowerCase() === String(config[k] ?? '').toLowerCase())
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
  bamboohr: 'BambooHR',
  oracle_orc: 'Oracle Recruiting',
  smartrecruiters: 'SmartRecruiters',
  personio: 'Personio',
  zoho: 'Zoho Recruit',
  taleo: 'Taleo',
  successfactors: 'SAP SuccessFactors',
  icims: 'iCIMS',
  jazzhr: 'JazzHR',
  breezy: 'Breezy HR',
  freshteam: 'Freshteam',
  manatal: 'Manatal',
  other_ats: 'Job board',
}
