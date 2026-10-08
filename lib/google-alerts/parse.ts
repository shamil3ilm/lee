import * as cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'
import { unwrapGoogleUrl } from './links'

/**
 * Google Alerts results, from the alert email (HTML, plain-text fallback) or
 * the alert's RSS (Atom) feed. Each result is a title, the target URL
 * (unwrapped offline) and the snippet. Only these fields leave this module.
 */

export interface GoogleAlertItem {
  title: string
  url: string
  snippet: string
  publishedAt?: Date
}

const MAX_ITEMS = 50
const MAX_TITLE = 200
const MAX_SNIPPET = 600

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_m, e: string) => ENTITIES[e] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function push(out: Map<string, GoogleAlertItem>, item: GoogleAlertItem): void {
  if (out.size >= MAX_ITEMS || out.has(item.url)) return
  const title = item.title.slice(0, MAX_TITLE)
  if (title.length < 4) return
  out.set(item.url, { ...item, title, snippet: item.snippet.slice(0, MAX_SNIPPET) })
}

/** Lines that are Google's own furniture, never a result. */
const FURNITURE = /^(flag as irrelevant|see more results|edit this alert|unsubscribe|view all|google alerts?|news|web|you have received this email|receive this alert as rss feed|send feedback)$/i

function fromHtml(html: string): GoogleAlertItem[] {
  const $ = cheerio.load(html)
  const out = new Map<string, GoogleAlertItem>()
  $('a[href]').each((_i, a) => {
    const url = unwrapGoogleUrl($(a).attr('href'))
    const title = stripHtml($(a).html() ?? '')
    if (!url || !title || FURNITURE.test(title)) return
    // The smallest block around the link that has more text than the title.
    let block = $(a).parent()
    for (let i = 0; i < 4 && block.length > 0 && stripHtml(block.text()).length <= title.length + 10; i++) block = block.parent()
    const snippet = stripHtml(block.text()).replace(title, '').trim()
    push(out, { title, url, snippet })
  })
  return [...out.values()]
}

/** Plain text: "Title\nSource\nSnippet\n<https://www.google.com/url?...>" blocks. */
function fromText(text: string): GoogleAlertItem[] {
  const out = new Map<string, GoogleAlertItem>()
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  let block: string[] = []
  for (const line of lines) {
    const m = /<?(https?:\/\/\S+?)>?$/.exec(line)
    const url = m ? unwrapGoogleUrl(m[1]) : null
    if (!url) {
      // A blank line separates results; Google's furniture lines never count.
      if (!line) block = []
      else if (!FURNITURE.test(line)) block.push(line)
      continue
    }
    const before = line.slice(0, m!.index).trim()
    const parts = [...block, ...(before ? [before] : [])].filter(Boolean)
    if (parts.length > 0) push(out, { title: parts[0]!, url, snippet: parts.slice(1).join(' ') })
    block = []
  }
  return [...out.values()]
}

export function parseGoogleAlertEmail(input: { html?: string | null; text?: string | null }): GoogleAlertItem[] {
  const html = input.html ? fromHtml(input.html) : []
  return html.length > 0 ? html : input.text ? fromText(input.text) : []
}

interface AtomEntry {
  title?: string | { '#text'?: string }
  link?: { '@_href'?: string } | Array<{ '@_href'?: string }>
  content?: string | { '#text'?: string }
  published?: string
  updated?: string
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true })

function text(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && typeof (v as { '#text'?: unknown })['#text'] === 'string') return (v as { '#text': string })['#text']
  return ''
}

/** The alert's RSS delivery: an Atom feed of results. */
export function parseGoogleAlertFeed(xml: string): GoogleAlertItem[] {
  const doc = parser.parse(xml) as { feed?: { entry?: AtomEntry | AtomEntry[] } }
  const raw = doc.feed?.entry
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : []
  const out = new Map<string, GoogleAlertItem>()
  for (const e of entries) {
    const link = Array.isArray(e.link) ? e.link[0] : e.link
    const url = unwrapGoogleUrl(link?.['@_href'])
    if (!url) continue
    const date = new Date(e.published ?? e.updated ?? '')
    push(out, {
      title: stripHtml(text(e.title)),
      url,
      snippet: stripHtml(text(e.content)),
      ...(Number.isNaN(date.getTime()) ? {} : { publishedAt: date }),
    })
  }
  return [...out.values()]
}
