import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'
import { boardFromUrl, type BoardRef } from '@/lib/companies/ats-detect'
import { robotsAllows } from '@/lib/radar/brief/robots'
import { companyGet, type CompanyHttpDeps } from './http'
import { domainOf } from './normalize'

/**
 * SERVER-ONLY. Find a company's careers page on its OWN website, politely:
 *
 *   1. read robots.txt first (4xx = no rules; unreadable = stop: be
 *      conservative); every page below is fetched only if robots allow it
 *      for lee's token or "*";
 *   2. the homepage: links to a job board (Greenhouse, Lever, Ashby,
 *      Workable, Recruitee, Pinpoint, Workday, Teamtailor…) or to a careers
 *      page, and role addresses (careers@, jobs@ …) on the company's domain;
 *   3. the linked careers page, else the common paths (/careers, /jobs,
 *      /join-us, /work-with-us) until one answers.
 *
 * At most MAX_PAGES pages per company, 1.5 MB each, through safeFetch. No
 * people data: only role addresses published on the company's own site.
 */

export const CAREERS_PATHS = ['/careers', '/jobs', '/join-us', '/work-with-us'] as const
export const MAX_PAGES = 4
const PAGE_MAX_BYTES = 1_500_000
const CAREERS_WORDS = /\b(careers?|jobs?|join (?:us|our team)|work with us|we(?:'|’)?re hiring|vacanc(?:y|ies)|openings?|hiring)\b|وظائف/i
const ROLE_LOCAL = /^(careers?|jobs?|hr|recruit(?:ment|ing|er)?|talent|hiring|join|work|people|apply|cv|resumes?)$/i
const EMAIL_RE = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}/g

export type CareersStatus = 'found' | 'none' | 'blocked'

export interface CareersResult {
  status: CareersStatus
  careersUrl: string | null
  board: BoardRef | null
  /** Role addresses on the company's own domain (careers@, jobs@ …). */
  emails: string[]
  /** sha256 (16 hex) of the careers page's visible text, for change detection. */
  textHash: string | null
  /** Why it stopped ("disallowed by robots.txt", "robots.txt unreadable"). */
  note?: string
  /** Pages fetched (robots.txt not counted). */
  fetched: number
}

/** Visible text of an HTML page, whitespace collapsed (scripts, styles and nav chrome dropped). */
export function pageText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, noscript, svg, template').remove()
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 50_000)
}

export function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

export interface PageLinks {
  boards: BoardRef[]
  careers: string[]
  emails: string[]
}

/** Board links, careers-page links (same site) and role addresses on one page. */
export function extractLinks(html: string, pageUrl: string, companyDomain: string): PageLinks {
  const $ = cheerio.load(html)
  const boards: BoardRef[] = []
  const careers: string[] = []
  const emails = new Set<string>()
  const addEmail = (raw: string): void => {
    const e = raw.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0] ?? ''
    const [local = '', host = ''] = e.split('@')
    if (!ROLE_LOCAL.test(local)) return
    if (host !== companyDomain && !host.endsWith(`.${companyDomain}`)) return
    emails.add(`${local}@${host}`)
  }
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim()
    if (/^mailto:/i.test(href)) return addEmail(href)
    let abs: URL
    try {
      abs = new URL(href, pageUrl)
    } catch {
      return
    }
    if (abs.protocol !== 'https:' && abs.protocol !== 'http:') return
    const b = boardFromUrl(abs.toString())
    if (b) {
      if (!boards.some((x) => x.kind === b.kind && x.slug === b.slug)) boards.push(b)
      return
    }
    const host = abs.hostname.toLowerCase().replace(/^www\./, '')
    const sameSite = host === companyDomain || host.endsWith(`.${companyDomain}`)
    const text = `${$(el).text()} ${abs.pathname}`
    if (sameSite && CAREERS_WORDS.test(text) && !careers.includes(abs.toString())) careers.push(abs.toString())
  })
  for (const m of $('body').text().matchAll(EMAIL_RE)) addEmail(m[0])
  return { boards, careers: careers.slice(0, 5), emails: [...emails].slice(0, 3) }
}

interface Ctx {
  deps: CompanyHttpDeps
  robots: Map<string, string | null>
  fetched: number
}

/** robots.txt per origin: '' when absent (4xx), null when unreadable. */
async function robotsOf(origin: string, ctx: Ctx): Promise<string | null> {
  if (ctx.robots.has(origin)) return ctx.robots.get(origin) ?? null
  let txt: string | null
  try {
    const res = await companyGet('careers robots', `${origin}/robots.txt`, ctx.deps, { accept: 'text/plain', maxBytes: 256 * 1024 })
    if (res.status >= 400 && res.status < 500) txt = ''
    else if (!res.ok) txt = null
    else txt = await res.text()
  } catch {
    txt = null
  }
  ctx.robots.set(origin, txt)
  return txt
}

type PageResult = { ok: true; html: string; url: string } | { ok: false; blocked: boolean }

async function getPage(url: string, ctx: Ctx): Promise<PageResult> {
  if (ctx.fetched >= MAX_PAGES) return { ok: false, blocked: false }
  const u = new URL(url)
  const robots = await robotsOf(u.origin, ctx)
  if (robots === null || !robotsAllows(robots, `${u.pathname}${u.search}`)) return { ok: false, blocked: true }
  ctx.fetched += 1
  try {
    const res = await companyGet('careers page', url, ctx.deps, { accept: 'text/html', maxBytes: PAGE_MAX_BYTES })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || (type && !/html/i.test(type))) {
      void res.body?.cancel().catch(() => undefined)
      return { ok: false, blocked: false }
    }
    return { ok: true, html: await res.text(), url: res.url || url }
  } catch {
    return { ok: false, blocked: false }
  }
}

function looksLikeCareers(html: string): boolean {
  const $ = cheerio.load(html)
  return CAREERS_WORDS.test(`${$('title').text()} ${$('h1, h2').text()}`)
}

/** Find the careers page, a job board and role addresses for a company website. */
export async function findCareers(website: string, deps: CompanyHttpDeps = {}): Promise<CareersResult> {
  const domain = domainOf(website)
  const empty = (status: CareersStatus, fetched: number, note?: string): CareersResult => ({
    status,
    careersUrl: null,
    board: null,
    emails: [],
    textHash: null,
    fetched,
    ...(note ? { note } : {}),
  })
  if (!domain) return empty('none', 0, 'no website')
  const origin = new URL(`https://${new URL(website.startsWith('http') ? website : `https://${website}`).hostname}`).origin
  const ctx: Ctx = { deps, robots: new Map(), fetched: 0 }
  const robots = await robotsOf(origin, ctx)
  if (robots === null) return empty('blocked', 0, 'robots.txt unreadable')

  const emails = new Set<string>()
  const home = await getPage(`${origin}/`, ctx)
  let candidates: string[] = []
  if (home.ok) {
    const links = extractLinks(home.html, home.url, domain)
    links.emails.forEach((e) => emails.add(e))
    const watchable = links.boards.find((b) => b.watchable) ?? links.boards[0]
    if (watchable) {
      return { status: 'found', careersUrl: watchable.url, board: watchable, emails: [...emails], textHash: null, fetched: ctx.fetched }
    }
    candidates = links.careers
  }
  const tried = new Set<string>()
  let blockedAll = !home.ok && 'blocked' in home && home.blocked
  for (const url of [...candidates, ...CAREERS_PATHS.map((p) => `${origin}${p}`)]) {
    if (ctx.fetched >= MAX_PAGES) break
    if (tried.has(url)) continue
    tried.add(url)
    const page = await getPage(url, ctx)
    if (!page.ok) {
      blockedAll = blockedAll && page.blocked
      continue
    }
    blockedAll = false
    const fromLink = candidates.includes(url)
    if (!fromLink && !looksLikeCareers(page.html)) continue
    const links = extractLinks(page.html, page.url, domain)
    links.emails.forEach((e) => emails.add(e))
    const b = links.boards.find((x) => x.watchable) ?? links.boards[0] ?? null
    return {
      status: 'found',
      careersUrl: b?.url ?? page.url,
      board: b,
      emails: [...emails].slice(0, 3),
      textHash: b ? null : textHash(pageText(page.html)),
      fetched: ctx.fetched,
    }
  }
  const res = empty(blockedAll ? 'blocked' : 'none', ctx.fetched, blockedAll ? 'disallowed by robots.txt' : undefined)
  return { ...res, emails: [...emails].slice(0, 3) }
}

/**
 * Weekly change check of a careers page with no job board: robots first,
 * then the page's visible-text hash. Null when robots forbid it or the page
 * can't be read.
 */
export async function careersPageHash(url: string, deps: CompanyHttpDeps = {}): Promise<string | null> {
  const ctx: Ctx = { deps, robots: new Map(), fetched: 0 }
  const page = await getPage(url, ctx)
  return page.ok ? textHash(pageText(page.html)) : null
}
