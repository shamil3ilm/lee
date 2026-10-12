import { boardFromUrl, type BoardRef } from '@/lib/companies/board-links'
import { decodeEntities, htmlToText } from '@/lib/discovery/adapters/html-text'
import { resolveLocation } from '@/lib/regions/normalize'
import { countryOf } from '@/lib/regions/tree'

/**
 * A job-news roundup post (Malayalam Gulf news sites such as Pravasi News
 * Daily): "<Employer> Careers 2026: …", "<Employer> Announces Multiple Job
 * Vacancies in Kuwait: …". Pure: reads one WordPress post (title + HTML)
 * and returns ONLY extracted fields — employer, country, role names,
 * walk-in details, outbound links classified with ats-detect, a snippet of
 * at most SNIPPET_MAX characters and a few risk sentences for Scam Shield.
 * The article itself is never stored.
 */

export const SNIPPET_MAX = 300
const MAX_ROLES = 15
const MAX_RISK = 3

export interface WpPost {
  id: number
  date: string
  link: string
  title: { rendered: string } | string
  content?: { rendered: string } | string
  categories?: number[]
}

export interface WalkIn {
  dates: string | null
  time: string | null
  venue: string | null
}

export interface NewsLink {
  url: string
  board: BoardRef | null
}

export interface NewsPostFacts {
  postId: number
  postUrl: string
  postedAt: Date | undefined
  title: string
  employer: string | null
  /** ISO-2 (upper case) when the post's categories or title name one country. */
  country: string | null
  /** Region-taxonomy ids the title names ("Dubai", "Kuwait"), deepest first. */
  regionIds: string[]
  roles: string[]
  walkIn: WalkIn | null
  /** Outbound links (the site's own pages, its WhatsApp channel and social links dropped). */
  links: NewsLink[]
  /** The employer's own website, when the post links it. */
  employerWebsite: string | null
  /** Apply-by-email addresses named in the post. */
  emails: string[]
  /** Fee / payment / WhatsApp-only sentences (≤ 160 chars each), for Scam Shield. */
  risk: string[]
  snippet: string
}

export interface ExtractOptions {
  /** The news site's host (its own links are not outbound). */
  siteHost: string
  /** WordPress category id → ISO-2 country ("47" → KW). */
  countryCategories?: Readonly<Record<string, string>>
}

const text = (v: { rendered: string } | string | undefined): string => (typeof v === 'string' ? v : (v?.rendered ?? ''))

/** Title as plain text, without the site's "|Apply Now For The Latest Vacancies" tail. */
export function cleanTitle(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, ''))
    .split('|')[0]!
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const PLACE_TAIL =
  /\s+(?:in\s+)?(?:the\s+)?(?:UAE|U\.A\.E|Dubai|Abu Dhabi|Sharjah|Ajman|Al Ain|Ras Al Khaimah|Kuwait|Qatar|Doha|Oman|Muscat|Bahrain|Saudi Arabia|KSA|Riyadh|Jeddah|India|Kerala)$/i
const NOT_EMPLOYER = /^(?:latest|top|best|new|urgent|multiple|various|govt|government|\d+)\b|\b(?:jobs?|vacancies|careers?)\b/i

function tidyEmployer(name: string | undefined): string | null {
  let n = (name ?? '').replace(/\s+/g, ' ').trim().replace(/[:–—-]+$/, '').trim()
  for (let i = 0; i < 2; i++) {
    const cut = n.replace(PLACE_TAIL, '').trim()
    // "American University of Sharjah" keeps its place.
    if (/\b(?:of|de)$/i.test(cut)) break
    n = cut
  }
  if (n.length < 2 || n.length > 80 || NOT_EMPLOYER.test(n)) return null
  return n
}

/** The employer a post is about: the content's "Company Name" row, else the title patterns. */
export function employerOf(title: string, plain: string): string | null {
  const row = /\bCompany Name\s*:?\s+(.{2,80}?)\s+(?:Job Location|Location|Industry|Job Title|Position|Nationality|Reported|Vacanc)/i.exec(plain)
  const fromRow = tidyEmployer(row?.[1])
  if (fromRow) return fromRow
  const patterns: RegExp[] = [
    /^(.+?)\s+Announces\b/i,
    /\bat\s+(.+?)\s*$/i,
    /[–—-]\s*(.+?)\s+(?:is\s+)?Hiring\b/i,
    /^(.+?)\s+(?:Careers|Jobs|Job Vacancies|Job Openings|Vacancies|Walk[\s-]?In Interview|Walk[\s-]?In|Recruitment|Hiring)\b/i,
  ]
  for (const re of patterns) {
    const hit = tidyEmployer(re.exec(title)?.[1])
    if (hit) return hit
  }
  return null
}

/** Role names: "The advertised positions include A, B and C." or numbered headings ("1. Social Media Officer – …"). */
export function rolesOf(plain: string, title: string): string[] {
  const roles: string[] = []
  const add = (r: string): void => {
    const t = r.replace(/\s+/g, ' ').replace(/^(?:and|or)\s+/i, '').replace(/[.;:]+$/, '').trim()
    if (t.length >= 3 && t.length <= 80 && /^[A-Z]/.test(t) && !/\b(?:include|including|following|vacancies|positions)\b/i.test(t) && !roles.some((x) => x.toLowerCase() === t.toLowerCase())) roles.push(t)
  }
  const list = /\b(?:positions|vacancies|roles|openings|jobs)\s+(?:listed\s+)?(?:include|includes)\s*:?\s+([^.]{5,600})\./i.exec(plain)
  if (list?.[1]) for (const part of list[1].split(/,\s*|\s+and\s+(?=[A-Z])/)) add(part)
  for (const m of plain.matchAll(/(?:^|\s)\d{1,2}\.\s+([A-Z][A-Za-z&/().,' -]{2,70}?)\s+[–—-]\s+[A-Z]/g)) add(m[1]!)
  const reported = /\bReported Vacancies\s+(.{3,120}?)\s+(?:Eligible|Gender|Reported|Education|Experience)\b/i.exec(plain)
  if (reported?.[1]) for (const part of reported[1].split(/,\s*|\s+and\s+/)) add(part)
  if (roles.length === 0) {
    // "Crescent … Careers 2026: Senior Accountant Vacancy in UAE" → the title's role.
    const t = /:\s*(.+?)\s+(?:Vacancy|Vacancies|Job|Jobs|Position)\b/i.exec(title)?.[1]
    if (t && !/\b(?:latest|multiple|current|various)\b/i.test(t)) add(t)
  }
  return roles.slice(0, MAX_ROLES)
}

/** Walk-in date, time and venue, when the post announces one. */
export function walkInOf(title: string, plain: string): WalkIn | null {
  if (!/walk[\s-]?in|recruitment (?:event|drive|dates?)|interview dates?/i.test(`${title} ${plain}`)) return null
  const month = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*'
  const dates =
    new RegExp(`\\b(?:from\\s+)?(${month}\\s+\\d{1,2}(?:\\s*(?:[–-]|to)\\s*(?:${month}\\s+)?\\d{1,2})?(?:,?\\s*\\d{4})?)`, 'i').exec(plain)?.[1] ??
    new RegExp(`\\b(\\d{1,2}(?:\\s*[–-]\\s*\\d{1,2})?\\s+${month}(?:\\s+\\d{4})?)`, 'i').exec(plain)?.[1] ??
    null
  const time = /\b(\d{1,2}(?::\d{2})?\s*[AP]M\s*(?:[–-]|to)\s*\d{1,2}(?::\d{2})?\s*[AP]M)\b/i.exec(plain)?.[1] ?? null
  const venueRaw = /\b(?:Venue|Interview (?:Venue|Location)|Location of (?:the )?Interview)\s*:?\s+([^.|]{4,100}?)(?=\s+(?:Date|Time|Reported|Interview|Contact|Note|Important)\b|\.|$)/i.exec(plain)?.[1]?.trim() ?? null
  const venue = venueRaw && /^[A-Z0-9]/.test(venueRaw) ? venueRaw : null
  if (!dates && !time && !venue) return null
  return { dates: dates?.replace(/\s+/g, ' ').trim() ?? null, time, venue }
}

const SOCIAL = /(^|\.)(facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|t\.me|telegram\.me|whatsapp\.com|wa\.me|linkedin\.com|tiktok\.com|threads\.net|pinterest\.com|google\.com|goo\.gl)$/

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Outbound links, decoded and deduplicated, each classified as a job board or not. */
export function linksOf(html: string, siteHost: string): NewsLink[] {
  const site = siteHost.toLowerCase().replace(/^www\./, '')
  const seen = new Set<string>()
  const out: NewsLink[] = []
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const url = decodeEntities(m[1]!).trim()
    const host = hostOf(url)
    if (!/^https?:\/\//i.test(url) || !host || host === site || host.endsWith(`.${site}`) || SOCIAL.test(host)) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, board: boardFromUrl(url) })
    if (out.length >= 40) break
  }
  return out
}

/** The employer's own site: a non-board link whose host carries a word of the employer's name. */
export function employerWebsiteOf(links: readonly NewsLink[], employer: string | null): string | null {
  const words = (employer ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !['the', 'and', 'llc', 'group', 'company', 'careers', 'international'].includes(w))
  const initials = (employer ?? '').split(/\s+/).map((w) => w[0]?.toLowerCase() ?? '').join('')
  // Home pages first ("crescentpetroleum.com/" over "careers.crescent.ae/…").
  const isHome = (u: string): number => {
    try {
      return new URL(u).pathname === '/' ? 1 : 0
    } catch {
      return 0
    }
  }
  const ordered = [...links].sort((a, b) => isHome(b.url) - isHome(a.url))
  for (const l of ordered) {
    if (l.board) continue
    const host = hostOf(l.url)
    const label = host.split('.')[0] ?? ''
    if (words.some((w) => host.includes(w)) || (initials.length >= 2 && label === initials)) {
      try {
        return `https://${new URL(l.url).hostname.toLowerCase()}`
      } catch {
        continue
      }
    }
  }
  return null
}

const RISK =
  /\b(?:(?:registration|processing|visa|recruitment|agency|service|application|medical|training|interview|placement|documentation) (?:fee|fees|charges?)|pay (?:a |the )?(?:fee|deposit|amount|charges?)|security deposit|whatsapp only|only (?:on|via|through) whatsapp|(?:contact|message) (?:us )?(?:on|via) whatsapp|send (?:your )?(?:cv|resume) (?:on|via|to) whatsapp)\b/i
/** The site's own disclaimers about fees ("Application Fee Not stated; verify directly"): not a risk sentence. */
const DISCLAIMER =
  /\bnot (?:stated|disclosed|specified|mentioned|charged)|\b(?:does|do|will) not (?:charge|ask|request)|\bno (?:fee|fees|charges?)\b|free of (?:charge|cost)|verify|confirm|never (?:pay|charge|ask)|(?:do|should) not pay|beware|cautio|avoid|be careful|\bis there\b|\?$/i

function riskOf(plain: string): string[] {
  const out: string[] = []
  for (const s of plain.split(/(?<=[.!?])\s+/)) {
    if (!RISK.test(s) || DISCLAIMER.test(s)) continue
    out.push(s.slice(0, 160))
    if (out.length >= MAX_RISK) break
  }
  return out
}

/** Fee, payment or messaging words: kept out of the snippet (the site's own warnings would read as the employer's). */
const MONEY_OR_CHANNEL = /\b(?:fees?|charges?|pay|payment|deposit|whatsapp|telegram)\b/i

/** The opening sentences, at most SNIPPET_MAX characters, without fee or channel talk (real risk sentences travel separately). */
function snippetOf(plain: string): string {
  let out = ''
  for (const s of plain.split(/(?<=[.!?])\s+/)) {
    if (MONEY_OR_CHANNEL.test(s)) continue
    const next = out ? `${out} ${s}` : s
    if (next.length > SNIPPET_MAX) return out || s.slice(0, SNIPPET_MAX)
    out = next
  }
  return out
}

function countryFrom(post: WpPost, title: string, opts: ExtractOptions): { country: string | null; regionIds: string[] } {
  const fromCats = (post.categories ?? []).map((c) => opts.countryCategories?.[String(c)]).filter((c): c is string => !!c)
  const placeIds = resolveLocation(title.replace(/\b20\d\d\b/g, ' '), { trustCodes: true }).places.map((p) => p.id)
  const fromTitle = [...new Set(placeIds.map((id) => countryOf(id)).filter((c): c is string => !!c).map((c) => c.toUpperCase()))]
  const country = fromCats.length === 1 ? fromCats[0]! : fromTitle.length === 1 ? fromTitle[0]! : (fromCats[0] ?? fromTitle[0] ?? null)
  const regionIds = placeIds.length > 0 ? placeIds : country ? [country.toLowerCase()] : []
  return { country, regionIds }
}

export function extractPost(post: WpPost, opts: ExtractOptions): NewsPostFacts {
  const title = cleanTitle(text(post.title))
  const html = text(post.content)
  const plain = htmlToText(html).replace(/\s+/g, ' ').trim()
  const employer = employerOf(title, plain)
  const links = linksOf(html, opts.siteHost)
  const date = new Date(post.date)
  const emails = [...new Set((plain.match(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase()))].slice(0, 3)
  return {
    postId: post.id,
    postUrl: post.link,
    postedAt: Number.isNaN(date.getTime()) ? undefined : date,
    title,
    employer,
    ...countryFrom(post, title, opts),
    roles: rolesOf(plain, title),
    walkIn: walkInOf(title, plain),
    links,
    employerWebsite: employerWebsiteOf(links, employer),
    emails,
    risk: riskOf(plain),
    snippet: snippetOf(plain),
  }
}
