import { siteForHost, type AlertSiteId } from './sites'

/**
 * Turn a link found in a job-alert email into the posting's canonical URL,
 * WITHOUT fetching anything. Alert links are tracking redirects; following
 * them server-side would mean requesting arbitrary hosts from an email
 * (SSRF risk) and would tell the sender the alert was opened. Instead:
 *
 *   1. If the link (or a URL embedded in one of its query parameters, the
 *      way most click-trackers carry their target) is on a known job site
 *      and carries a recognisable job id, rebuild the canonical posting URL
 *      from that id.
 *   2. Otherwise keep the link as it is (`canonical: false`), minus
 *      obvious tracking parameters when it is already on the site's host.
 */

export interface ResolvedJobLink {
  site: AlertSiteId
  /** Stable per-site job id (used for dedupe), e.g. the LinkedIn job number. */
  jobKey: string
  url: string
  /** False when the id could not be rebuilt into a clean posting URL. */
  canonical: boolean
}

/** Query parameters click-trackers use to carry the destination URL. */
const TARGET_PARAMS = ['url', 'u', 'target', 'dest', 'destination', 'redirect', 'redirect_url', 'rurl', 'r', 'goto', 'link', 'to']

const MAX_UNWRAP_DEPTH = 3

function parseUrl(value: string): URL | null {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

/** Candidate URLs: the link itself, then any http(s) URL carried in a query parameter. */
function candidates(link: URL, depth = 0): URL[] {
  const out: URL[] = [link]
  if (depth >= MAX_UNWRAP_DEPTH) return out
  for (const [key, value] of link.searchParams) {
    if (!TARGET_PARAMS.includes(key.toLowerCase()) && !/^https?%3a|^https?:/i.test(value)) continue
    const inner = parseUrl(value) ?? parseUrl(safeDecode(value))
    if (inner) out.push(...candidates(inner, depth + 1))
  }
  return out
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

type Rebuild = (u: URL) => { jobKey: string; url: string } | null

const origin = (u: URL): string => `https://${u.hostname.toLowerCase()}`

const REBUILD: Record<AlertSiteId, Rebuild> = {
  linkedin: (u) => {
    const m = u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/) ?? null
    const id = m?.[1] ?? u.searchParams.get('currentJobId') ?? u.searchParams.get('jobId')
    if (!id || !/^\d{6,}$/.test(id)) return null
    return { jobKey: id, url: `https://www.linkedin.com/jobs/view/${id}/` }
  },
  indeed: (u) => {
    const jk = u.searchParams.get('jk') ?? u.searchParams.get('vjk')
    if (!jk || !/^[0-9a-f]{16}$/i.test(jk)) return null
    // Keep the country host (ae.indeed.com, in.indeed.com …) so the posting
    // opens on the site the alert came from.
    const host = u.hostname.toLowerCase().endsWith('indeed.com') && !/^(cts|click|engage|link|email)\./.test(u.hostname)
      ? u.hostname.toLowerCase()
      : 'www.indeed.com'
    return { jobKey: jk.toLowerCase(), url: `https://${host}/viewjob?jk=${jk.toLowerCase()}` }
  },
  naukri: (u) => {
    const m = u.pathname.match(/^\/(job-listings-[a-z0-9-]*?-(\d{9,15}))\/?$/i)
    const id = m?.[2] ?? u.searchParams.get('jobId')
    if (!m || !id) return null
    return { jobKey: id, url: `https://www.naukri.com/${m[1]}` }
  },
  naukrigulf: (u) => {
    const m = u.pathname.match(/^\/([a-z0-9-]+-jid-(\d{6,}))\/?$/i)
    if (!m?.[2]) return null
    return { jobKey: m[2], url: `https://www.naukrigulf.com/${m[1]}` }
  },
  bayt: (u) => {
    const m = u.pathname.match(/^\/([a-z]{2})\/([a-z-]+)\/jobs\/([a-z0-9-]*?-(\d{5,}))\/?$/i)
    if (!m?.[4]) return null
    return { jobKey: m[4], url: `https://www.bayt.com/${m[1]}/${m[2]}/jobs/${m[3]}/` }
  },
  gulftalent: (u) => {
    // /uae/jobs/<slug>-<id>, also /mobile/uae/jobs/…; not the listing paths
    // /uae/jobs/title/…, /uae/jobs/city/….
    const m = u.pathname.match(/^\/(?:mobile\/)?((?:[a-z-]+\/)?jobs\/[a-z0-9-]*?-(\d{4,}))\/?$/i)
    if (!m?.[2]) return null
    return { jobKey: m[2], url: `https://www.gulftalent.com/${m[1]}` }
  },
  glassdoor: (u) => {
    const id = u.searchParams.get('jl') ?? u.searchParams.get('jobListingId')
    if (!id || !/^\d{5,}$/.test(id)) return null
    // The public listing page keeps its path (the slug is part of the URL);
    // no short canonical form is documented, so only the query is cleaned.
    if (/^\/job-listing\/[^/]+\.htm$/i.test(u.pathname)) {
      return { jobKey: id, url: `${origin(u)}${u.pathname}?jl=${id}` }
    }
    return { jobKey: id, url: `https://www.glassdoor.com/partner/jobListing.htm?jobListingId=${id}` }
  },
}

/**
 * Click-through paths that lead to one posting but carry no job id we can
 * read offline (e.g. Indeed sponsored `/pagead/clk`, compressed
 * `cts.indeed.com/v3/…` links). Kept as raw links, never followed.
 */
const JOB_CLICK_RE: Record<AlertSiteId, RegExp> = {
  linkedin: /^\/(comm\/)?jobs\/view\//i,
  indeed: /^\/(pagead\/clk|rc\/clk|viewjob|applystart|v3\/)/i,
  naukri: /^\/job-listings-/i,
  naukrigulf: /-jid-/i,
  bayt: /^\/[a-z]{2}\/[a-z-]+\/jobs\/[a-z0-9-]+-\d+\/?$/i,
  gulftalent: /\/jobs\/[a-z0-9-]+-\d+\/?$/i,
  glassdoor: /^\/(job-listing\/|partner\/joblisting)/i,
}

/** Parameters that only track the click; dropped from non-canonical links. */
// Includes recipient tokens (LinkedIn otpToken / midToken can sign the
// recipient in): those must never be stored.
const TRACKING_PARAM_RE =
  /^(utm_[a-z]+|trk|trackingid|refid|lipi|midtoken|midsig|eid|otptoken|ssid|src|sid|mailid|cid|from|alid|tk|rjptk|xpse|xfps|xkcb|ref|campaign|source|medium|email|token|auth|sig|signature|uid|userid|user_id|e)$/i

function stripTracking(u: URL): string {
  const clean = new URL(u.toString())
  for (const key of [...clean.searchParams.keys()]) {
    if (TRACKING_PARAM_RE.test(key)) clean.searchParams.delete(key)
  }
  clean.hash = ''
  return clean.toString()
}

/**
 * Resolve one alert link. Returns null when neither the link nor anything
 * embedded in it points at a known job site.
 */
export function resolveJobLink(href: string): ResolvedJobLink | null {
  const link = parseUrl(href)
  if (!link) return null
  const all = candidates(link)
  for (const c of all) {
    const site = siteForHost(c.hostname)
    if (!site) continue
    const rebuilt = REBUILD[site.id](c)
    if (rebuilt) return { site: site.id, jobKey: rebuilt.jobKey, url: rebuilt.url, canonical: true }
  }
  return null
}

/**
 * Fallback for a link that points at one posting on a known site but whose
 * job id can't be read offline: the raw link with tracking and recipient
 * parameters removed. Never fetched.
 */
export function unresolvedJobClick(href: string): { site: AlertSiteId; url: string } | null {
  const link = parseUrl(href)
  if (!link || link.protocol !== 'https:') return null
  const site = siteForHost(link.hostname)
  if (!site || !JOB_CLICK_RE[site.id].test(link.pathname)) return null
  return { site: site.id, url: stripTracking(link) }
}
