import { createHash } from 'node:crypto'
import * as cheerio from 'cheerio'
import { resolveJobLink, unresolvedJobClick } from './links'
import { isArabicLocation } from './arabic-places'
import type { AlertSiteId } from './sites'

/** The slice of domhandler's node shape the parser reads (cheerio doesn't export it). */
export interface AnyNode {
  type: string
  parent: AnyNode | null
}
export interface Element extends AnyNode {
  tagName: string
  children: AnyNode[]
}

/**
 * Job-alert email parser. One generic pipeline with per-site noise rules,
 * because every site's alert is the same shape: a list of cards, each with
 * a title link to the posting, the company and the location nearby.
 *
 *   HTML (cheerio): group every link by the job it points at, take the title
 *   from the best anchor text, and read company / location from the lines
 *   of the smallest block around it that holds no other job.
 *   Plain text (fallback when there is no HTML part, or HTML yields nothing):
 *   each job URL closes a block; the lines before it are title, company,
 *   location.
 *
 * Only these extracted fields leave this module — never the body.
 */

export interface AlertJob {
  site: AlertSiteId
  jobKey: string
  title: string
  company: string
  location?: string
  /**
   * Canonical posting URL rebuilt from the job id, or — when the id can't be
   * read offline — the alert's own link with tracking and recipient tokens
   * removed (`canonical: false`). The raw tracking link is never kept: some
   * carry sign-in tokens for the recipient.
   */
  url: string
  canonical: boolean
}

export interface AlertEmailInput {
  site: AlertSiteId
  html?: string | null
  text?: string | null
}

const MAX_JOBS_PER_EMAIL = 60
const MAX_FIELD = 200

/** Anchor texts that are calls to action, not job titles. */
const CTA_RE =
  /^(view( job| details| all( jobs)?)?|apply( now)?|easy apply|easily apply|quick apply|see (job|more|all jobs?)|see all \d* ?jobs|more jobs|save( job)?|unsubscribe|learn more|details|read more|open|show more|view similar jobs|apply on company site|search( jobs)?|job alert|manage alerts?|edit alert)$/i

/** Lines inside a job card that are neither company nor location. */
const NOISE_RES: readonly RegExp[] = [
  /^(new|promoted|sponsored|featured|urgent(ly hiring)?|hot job|top applicant|actively recruiting|be an early applicant|verified|premium)$/i,
  /^(easy apply|easily apply|quick apply|apply now|responsive employer|hiring multiple candidates)$/i,
  /\b\d+\s*(\+\s*)?(applicants?|connections?|alumni|employees?)\b/i,
  /^(just posted|today|yesterday|posted (today|yesterday|\d+ .*ago)|\d+\s*(\+\s*)?(minutes?|hours?|days?|weeks?|months?|d|h)\s*ago|active \d+ days? ago)$/i,
  /^(\d+\s*-\s*\d+|\d+\+?)\s*(yrs?|years?)(\s+exp(erience)?)?$/i,
  /^[₹$€£]|\b(aed|sar|qar|kwd|bhd|omr|inr|usd|lpa|lacs?|per (month|year|annum|hour))\b/i,
  /^(skills?|key ?skills?|job description)\s*:/i,
  // Labelled card lines (NaukriGulf, Bayt): "Experience: 2 - 5 Years", "Salary: Not Disclosed".
  /^(experience|exp|salary|industry|job role|role|functional area|nationality|gender|vacanc(y|ies)|education|job type|employment type|career level|posted( on)?)\s*:/i,
  // Glassdoor age chips: "3d", "24h", "30d+".
  /^\d+\s*[dh]\+?$/i,
  /^(full[- ]?time|part[- ]?time|contract|internship|temporary|permanent)$/i,
  /^(entry level|junior|mid[- ]?(level|career|senior)|senior( level)?|management|executive|career level:.*|experience level:.*)$/i,
  /^\d(\.\d)?\s*★?$/,
  /^[•·|,\-–—\s]+$/,
]

const PLACE_RE =
  /\b(remote|hybrid|on-?site|work from home|wfh|anywhere|worldwide|united arab emirates|uae|dubai|abu dhabi|sharjah|ajman|ras al khaimah|saudi( arabia)?|ksa|riyadh|jeddah|dammam|khobar|dhahran|makkah|mecca|madinah|medina|jubail|yanbu|tabuk|neom|qatar|doha|lusail|kuwait|salmiya|hawalli|bahrain|manama|muharraq|riffa|oman|muscat|salalah|sohar|nizwa|al ain|fujairah|umm al quwain|india|bengaluru|bangalore|hyderabad|chennai|mumbai|pune|delhi|ncr|gurgaon|gurugram|noida|kochi|cochin|kerala|thiruvananthapuram|trivandrum|kolkata|ahmedabad|jaipur|coimbatore|united states|usa|united kingdom|uk|london|germany|berlin|europe|emea|apac|singapore|canada|australia)\b/i

const SEPARATOR_RE = /\s+[·•|–—]\s+|\s+-\s+/

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD)
}

function isNoise(line: string): boolean {
  return CTA_RE.test(line) || NOISE_RES.some((re) => re.test(line))
}

/** Words that may sit around place names in a location line. */
const LOCATION_FILLER_RE =
  /\b(in|city|and|or|the|of|area|region|emirate|emirates|province|state|district|metropolitan|greater|governorate|country)\b/gi

const PLACE_GLOBAL_RE = new RegExp(PLACE_RE.source, 'gi')

/**
 * True when a line is only a location: place names plus filler ("Remote in
 * Dubai", "Dubai - UAE", "Riyadh, Saudi Arabia (On-site)"), or the
 * "City, Region, Country" shape. "Dubai Holding" is not (a company).
 */
export function isLocationLine(line: string): boolean {
  const parts = line.split(SEPARATOR_RE).filter((p) => p.trim())
  if (parts.length > 1) return parts.every((p) => isLocationLine(p.trim()))
  if (/[؀-ۿ]/.test(line)) return isArabicLocation(line)
  if (/^[A-Z][\w.'-]*( [A-Z][\w.'-]*)*,\s*[A-Z][\w .'-]+(,\s*[A-Z][\w .'-]+)?(\s*\([^)]*\))?$/.test(line)) return true
  if (!PLACE_RE.test(line)) return false
  const residue = line
    .replace(/\([^)]*\)/g, ' ')
    .replace(PLACE_GLOBAL_RE, ' ')
    .replace(LOCATION_FILLER_RE, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return residue.length <= 2
}

/**
 * Company and location from a job card's lines (title already removed).
 * Handles "Company · Location" / "Company - Location" on one line.
 */
export function companyAndLocation(lines: readonly string[]): { company: string; location?: string } {
  const useful = lines.map(clean).filter((l) => l.length > 0 && !isNoise(l))
  let company = ''
  let location: string | undefined
  for (const line of useful) {
    if (company && location) break
    if (isLocationLine(line)) {
      location ??= line
      continue
    }
    const parts = line.split(SEPARATOR_RE).map(clean).filter(Boolean)
    const placeIdx = parts.findIndex((p, i) => i > 0 && isLocationLine(p))
    if (parts.length >= 2 && placeIdx > 0) {
      if (!company) company = parts.slice(0, placeIdx).join(' - ')
      location ??= parts.slice(placeIdx).join(' - ')
      continue
    }
    if (!company && line.length <= 100) company = line
  }
  return { company, location }
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const BLOCK_TAGS = new Set([
  'p', 'div', 'td', 'th', 'tr', 'li', 'ul', 'ol', 'table', 'tbody', 'thead', 'section', 'article',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'center', 'header', 'footer', 'span-block',
])

/** Text of a node split into visual lines (block elements and <br> break lines). */
export function textLines(node: AnyNode): string[] {
  const out: string[] = []
  let current = ''
  const flush = (): void => {
    const t = clean(current)
    if (t) out.push(t)
    current = ''
  }
  const walk = (n: AnyNode): void => {
    if (n.type === 'text') {
      current += ` ${(n as unknown as { data: string }).data}`
      return
    }
    if (n.type !== 'tag') return
    const el = n as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'style' || tag === 'script' || tag === 'head' || tag === 'title') return
    const block = BLOCK_TAGS.has(tag)
    if (block) flush()
    for (const child of el.children) walk(child)
    if (block) flush()
  }
  walk(node)
  flush()
  return out
}

interface LinkGroup {
  /** Job id, or `null` for a link whose id can't be read offline. */
  jobKey: string | null
  url: string
  canonical: boolean
  anchors: Element[]
}

/** Dedupe key for a job whose link carries no readable id. */
function hashedKey(site: AlertSiteId, title: string, company: string): string {
  const h = createHash('sha256').update(`${site}|${title.toLowerCase()}|${company.toLowerCase()}`).digest('hex')
  return `h-${h.slice(0, 20)}`
}

function anchorTitle($: cheerio.CheerioAPI, a: Element): { title: string; fromAlt: boolean } {
  const $a = $(a as never)
  const text = clean($a.text())
  if (text && !CTA_RE.test(text)) return { title: text, fromAlt: false }
  const alt = clean($a.attr('title') ?? $a.find('img[alt]').attr('alt') ?? '')
  return { title: alt && !CTA_RE.test(alt) ? alt : '', fromAlt: true }
}

/** Distinct job keys linked from inside `el`. */
function jobKeysWithin($: cheerio.CheerioAPI, el: Element, keyOf: Map<Element, string>): Set<string> {
  const keys = new Set<string>()
  $(el as never)
    .find('a[href]')
    .each((_, a) => {
      const k = keyOf.get(a as Element)
      if (k) keys.add(k)
    })
  return keys
}

/**
 * The largest ancestor of `anchor` that still contains links to this job
 * only: the job's card. Stops at <body>.
 */
export function cardFor($: cheerio.CheerioAPI, anchor: Element, key: string, keyOf: Map<Element, string>): Element {
  let card: Element = anchor
  let node = anchor.parent
  while (node && node.type === 'tag') {
    const el = node as Element
    if (el.tagName.toLowerCase() === 'body' || el.tagName.toLowerCase() === 'html') break
    const keys = jobKeysWithin($, el, keyOf)
    if (keys.size > 1 || (keys.size === 1 && !keys.has(key))) break
    card = el
    node = el.parent
  }
  return card
}

export function parseAlertHtml(site: AlertSiteId, html: string): AlertJob[] {
  const $ = cheerio.load(html)
  const groups = new Map<string, LinkGroup>()
  const keyOf = new Map<Element, string>()
  $('a[href]').each((_, node) => {
    const a = node as Element
    const href = $(a as never).attr('href') ?? ''
    const resolved = resolveJobLink(href)
    let group: Omit<LinkGroup, 'anchors'> | null = null
    let key: string
    if (resolved && resolved.site === site) {
      key = `id:${resolved.jobKey}`
      group = { jobKey: resolved.jobKey, url: resolved.url, canonical: true }
    } else {
      const click = resolved ? null : unresolvedJobClick(href)
      if (!click || click.site !== site) return
      key = `url:${click.url}`
      group = { jobKey: null, url: click.url, canonical: false }
    }
    keyOf.set(a, key)
    const g = groups.get(key)
    if (g) g.anchors.push(a)
    else groups.set(key, { ...group, anchors: [a] })
  })

  const jobs: AlertJob[] = []
  const seenKeys = new Set<string>()
  for (const [groupKey, g] of groups) {
    if (jobs.length >= MAX_JOBS_PER_EMAIL) break
    // The title is the first anchor with real link text (≤ 120 chars: longer
    // ones wrap a whole card); an image's alt text (often the company logo)
    // is only a last resort.
    const titled = g.anchors.map((a) => ({ a, ...anchorTitle($, a) })).filter((x) => x.title.length >= 2)
    const best =
      titled.find((x) => !x.fromAlt && x.title.length <= 120) ?? titled.find((x) => !x.fromAlt) ?? titled[0]
    if (!best) continue
    const card = cardFor($, best.a, groupKey, keyOf)
    const lines = textLines(card)
    const titleIdx = lines.findIndex((l) => l === best.title || l.startsWith(best.title))
    const after = titleIdx >= 0 ? [...lines.slice(titleIdx + 1), ...lines.slice(0, titleIdx)] : lines
    const rest = titleIdx >= 0 && lines[titleIdx] !== best.title
      ? [clean(lines[titleIdx]!.slice(best.title.length)), ...after]
      : after
    const { company, location } = companyAndLocation(rest.filter((l) => l !== best.title))
    const companyName = company || 'Unknown company'
    const jobKey = g.jobKey ?? hashedKey(site, best.title, companyName)
    if (seenKeys.has(jobKey)) continue
    seenKeys.add(jobKey)
    jobs.push({ site, jobKey, title: best.title, company: companyName, location, url: g.url, canonical: g.canonical })
  }
  return jobs
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

export function parseAlertText(site: AlertSiteId, text: string): AlertJob[] {
  const jobs = new Map<string, AlertJob>()
  let block: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = clean(rawLine)
    if (!line) {
      block = []
      continue
    }
    const urls = line.match(URL_RE) ?? []
    const label = clean(line.replace(URL_RE, '').replace(/[:<>\-–]+\s*$/, ''))
    if (urls.length === 0) {
      block.push(line)
      continue
    }
    for (const href of urls) {
      const resolved = resolveJobLink(href)
      const target =
        resolved && resolved.site === site
          ? { jobKey: resolved.jobKey as string | null, url: resolved.url, canonical: true }
          : (() => {
              const click = resolved ? null : unresolvedJobClick(href)
              return click && click.site === site ? { jobKey: null, url: click.url, canonical: false } : null
            })()
      if (!target) continue
      const lines = [...block, ...(label && !isNoise(label) ? [label] : [])].filter((l) => !isNoise(l))
      const [title, ...rest] = lines
      if (!title) continue
      const { company, location } = companyAndLocation(rest)
      const companyName = company || 'Unknown company'
      const jobKey = target.jobKey ?? hashedKey(site, title, companyName)
      if (jobs.has(jobKey)) continue
      jobs.set(jobKey, { site, jobKey, title, company: companyName, location, url: target.url, canonical: target.canonical })
      if (jobs.size >= MAX_JOBS_PER_EMAIL) return [...jobs.values()]
    }
    block = []
  }
  return [...jobs.values()]
}

/** Jobs in one alert email: HTML first, the plain-text part as a fallback. */
export function parseAlertEmail(input: AlertEmailInput): AlertJob[] {
  const { site } = input
  if (input.html) {
    try {
      const fromHtml = parseAlertHtml(site, input.html)
      if (fromHtml.length > 0) return fromHtml
    } catch {
      // Malformed HTML: fall through to the text part.
    }
  }
  if (input.text) return parseAlertText(site, input.text)
  return []
}
