/**
 * Links in text the user pasted (an AI Mode answer, an email, a list of
 * URLs). Pure and offline: nothing here fetches anything. Pasted links are
 * never requested by lee; only known ATS links are enriched, through the
 * ATS's own public job-board API (see ./ats-route.ts).
 */

export const MAX_URLS = 50
const URL_RE = /https?:\/\/[^\s<>"'`{}|\\^[\]]+/gi
const TRAILING_PUNCT_RE = /[.,;:!?'"*_~]+$/

/** Query parameters that only track a click or a campaign. */
const TRACKING_PARAM_RE =
  /^(utm_[a-z_]+|gclid|fbclid|msclkid|mc_[a-z]+|ref|refid|referrer|source|src|trk|trackingid|gh_src|lever-source|lever-origin|ashby_src|ccuid|cid|sid|si|feature|origin|campaign|medium|share|shared|from)$/i

/** Strip what Markdown and prose leave around a URL: trailing punctuation, an unbalanced ")". */
function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING_PUNCT_RE, '')
  while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1).replace(TRAILING_PUNCT_RE, '')
  }
  return url
}

function parse(value: string): URL | null {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

function isGoogleHost(host: string): boolean {
  return /(^|\.)google\.[a-z.]{2,6}$/i.test(host) || /(^|\.)googleusercontent\.com$/i.test(host)
}

/**
 * Google's own wrappers, unwrapped WITHOUT a request:
 * - `google.com/url?q=<target>` (a search-result click link) → the target;
 * - every other Google URL (a search page, a grounding redirect such as
 *   vertexaisearch.cloud.google.com/grounding-api-redirect/…, whose target
 *   is not in the link) → null: lee never follows it.
 */
export function unwrapGoogleLink(u: URL): URL | null {
  const host = u.hostname.toLowerCase()
  if (!isGoogleHost(host)) return u
  if (u.pathname === '/url') {
    const inner = parse(u.searchParams.get('q') ?? u.searchParams.get('url') ?? '')
    return inner && !isGoogleHost(inner.hostname) ? inner : null
  }
  return null
}

/** One stable form per posting: https, lower-case host, no tracking params, no fragment, no trailing slash. */
export function canonicalUrl(value: string | URL): string | null {
  const u = typeof value === 'string' ? parse(value) : new URL(value.toString())
  if (!u) return null
  u.protocol = 'https:'
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
  u.hash = ''
  u.username = ''
  u.password = ''
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM_RE.test(key)) u.searchParams.delete(key)
  }
  u.searchParams.sort()
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '')
  return u.toString()
}

export interface FoundUrl {
  /** The link as it will be stored and shown (Google wrappers removed, tracking stripped). */
  url: string
  /** Where in the pasted text the link started (keeps the text around it for context). */
  index: number
}

/**
 * Every distinct http(s) link in `text`, in order, capped at MAX_URLS.
 * Google search / grounding redirects are dropped (never followed).
 */
export function extractUrls(text: string): FoundUrl[] {
  const out: FoundUrl[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(URL_RE)) {
    const parsed = parse(trimUrl(m[0]))
    const target = parsed ? unwrapGoogleLink(parsed) : null
    const url = target ? canonicalUrl(target) : null
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ url, index: m.index ?? 0 })
    if (out.length >= MAX_URLS) break
  }
  return out
}

/** Canonical forms of every link in the pasted text: the allow-list for AI-extracted URLs. */
export function urlAllowList(text: string): Set<string> {
  return new Set(extractUrls(text).map((f) => f.url))
}

/** Job boards whose pages lee keeps as a link only (their terms or robots forbid automated reading). */
const LINK_ONLY_HOSTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)indeed\.[a-z.]+$/, 'Indeed'],
  [/(^|\.)naukrigulf\.com$/, 'NaukriGulf'],
  [/(^|\.)naukri\.com$/, 'Naukri'],
  [/(^|\.)bayt\.com$/, 'Bayt'],
  [/(^|\.)gulftalent\.com$/, 'GulfTalent'],
  [/(^|\.)glassdoor\.[a-z.]+$/, 'Glassdoor'],
  [/(^|\.)foundit\.[a-z.]+$|(^|\.)monster\.[a-z.]+$/, 'foundit'],
  [/(^|\.)wellfound\.com$/, 'Wellfound'],
  [/(^|\.)internshala\.com$/, 'Internshala'],
  [/(^|\.)dubizzle\.com$/, 'dubizzle'],
  [/(^|\.)smartrecruiters\.com$/, 'SmartRecruiters'],
]

/** The job board's display name when `url` is on one lee only links to. */
export function linkOnlyBoard(url: string): string | null {
  const u = parse(url)
  if (!u) return null
  const host = u.hostname.toLowerCase()
  return LINK_ONLY_HOSTS.find(([re]) => re.test(host))?.[1] ?? null
}

/** Host without "www.", for labels ("careers.example.com"). */
export function hostOf(url: string): string {
  return parse(url)?.hostname.toLowerCase().replace(/^www\./, '') ?? ''
}
