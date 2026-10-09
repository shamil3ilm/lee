import * as cheerio from 'cheerio'
import { cardFor, textLines, type Element } from '@/lib/email-alerts/parse'
import { canonicalPostUrl, canonicalProfileUrl } from './urls'
import { capBytes, MAX_SNIPPET_BYTES } from './snippet'

/**
 * LinkedIn member-notification emails ("X posted", "X shared a post",
 * "Top posts for you" digests) → the posts they show: poster, headline,
 * snippet and canonical post link. Tolerant by design: LinkedIn changes
 * these emails often, so it keys on what stays stable (post links carry a
 * feed URN or a /posts/ slug, actor links are /in/<slug>) and reads the
 * text around them; the plain-text part is the fallback. Parsed in memory;
 * only these fields leave this module, never the body.
 */

export type PostEmailKind = 'single' | 'digest' | 'shared' | 'other'

export interface EmailPost {
  key: string
  url: string
  posterName: string | null
  posterHeadline: string | null
  posterUrl: string | null
  /** Post text as the email shows it (often truncated), ≤ 1 KB. */
  snippet: string
}

export interface ParsedPostEmail {
  kind: PostEmailKind
  posts: EmailPost[]
}

export interface PostEmailInput {
  subject?: string | null
  html?: string | null
  text?: string | null
}

const MAX_POSTS = 30
const MAX_LINE = 300

/** Lines that are chrome, not post text. */
const NOISE: readonly RegExp[] = [
  /^(view|see|read) (post|more|all|full post|comments?)\b.*$/i,
  /^(like|comment|repost|share|send|reply|follow|connect|message)(\s*[·•|]\s*(like|comment|repost|share|send|reply))*$/i,
  /^\d[\d,.]*\s*(reactions?|likes?|comments?|reposts?|shares?|views?|impressions?)(\s*[·•|]\s*\d[\d,.]*\s*\w+)*$/i,
  /^(\d+\s*(s|m|h|d|w|mo|y|yr)|just now|edited|promoted)(\s*[·•]\s*\w+)*$/i,
  /^(manage notifications|unsubscribe|notification settings|help|privacy|you are receiving|this email was intended for|©|linkedin corporation)/i,
  /\bunsubscribe\b|\b© \d{4}\b|\blinkedin corporation\b/i,
  /^(top posts for you|trending in your network|see more posts|hi |hello |here is what|here's what)/i,
  /^-{3,}$/,
  /^view post:?$/i,
]

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE)
}

function isNoise(line: string): boolean {
  return line.length === 0 || NOISE.some((re) => re.test(line))
}

/** "Layla Haddad posted: …", "Omar Saleh shared a post" → the name. */
export function posterFromSubject(subject: string | null | undefined): string | null {
  const m = /^(.{2,80}?)\s+(?:posted|shared a post|reposted|shared|wrote|is hiring)\b/i.exec(subject ?? '')
  return m ? clean(m[1]!) : null
}

/** Subjects of post notifications (what a parse failure is counted against). */
export function looksLikePostEmail(subject: string | null | undefined): boolean {
  return /\bpost(?:ed|s)?\b|\bshared\b|\breposted\b|\btrending\b|\bhiring\b|\bin your network\b|\bmentioned\b/i.test(subject ?? '')
}

function kindOf(subject: string | null | undefined, count: number): PostEmailKind {
  if (count === 0) return 'other'
  if (/\bshared a post\b|\breposted\b/i.test(subject ?? '')) return 'shared'
  return count > 1 ? 'digest' : 'single'
}

interface Poster {
  name: string | null
  url: string | null
}

/** Assemble one post from its card's lines and the poster found in it. */
function fromLines(lines: readonly string[], poster: Poster, link: { key: string; url: string }): EmailPost {
  const useful = lines.map(clean).filter((l) => !isNoise(l))
  const nameIdx = poster.name ? useful.findIndex((l) => l === poster.name) : -1
  const afterName = nameIdx >= 0 ? useful[nameIdx + 1] : undefined
  // The headline is the short line under the name; a long one is the post itself.
  const headline = afterName && afterName.length <= 120 && useful.length > nameIdx + 2 ? afterName : null
  const body = useful.filter((l, i) => i !== nameIdx && !(headline && i === nameIdx + 1) && l !== poster.name)
  return {
    key: link.key,
    url: link.url,
    posterName: poster.name,
    posterHeadline: headline,
    posterUrl: poster.url,
    snippet: capBytes(body.join('\n'), MAX_SNIPPET_BYTES),
  }
}

export function parsePostHtml(html: string, subject?: string | null): EmailPost[] {
  const $ = cheerio.load(html)
  const keyOf = new Map<Element, string>()
  const links = new Map<string, { key: string; url: string; anchors: Element[] }>()
  $('a[href]').each((_, node) => {
    const a = node as unknown as Element
    const link = canonicalPostUrl($(node).attr('href') ?? '')
    if (!link) return
    keyOf.set(a, link.key)
    const g = links.get(link.key)
    if (g) g.anchors.push(a)
    else links.set(link.key, { ...link, anchors: [a] })
  })
  const fallbackName = links.size === 1 ? posterFromSubject(subject) : null
  const posts: EmailPost[] = []
  for (const g of links.values()) {
    if (posts.length >= MAX_POSTS) break
    const card = cardFor($, g.anchors[0]!, g.key, keyOf)
    let poster: Poster = { name: null, url: null }
    $(card as never)
      .find('a[href]')
      .each((_, node) => {
        if (poster.url) return
        const url = canonicalProfileUrl($(node).attr('href') ?? '')
        if (!url) return
        const name = clean($(node).text()) || clean($(node).find('img[alt]').attr('alt') ?? '')
        if (name) poster = { name, url }
        else poster = { name: null, url }
      })
    if (!poster.name && fallbackName) poster = { ...poster, name: fallbackName }
    const post = fromLines(textLines(card as never), poster, g)
    if (post.snippet || post.posterName) posts.push(post)
  }
  return posts
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

/** Plain text: each post link closes a card made of the lines since the previous one. */
export function parsePostText(text: string, subject?: string | null): EmailPost[] {
  const posts = new Map<string, EmailPost>()
  let card: string[] = []
  let poster: Poster = { name: null, url: null }
  for (const raw of text.split(/\r?\n/)) {
    const line = clean(raw)
    const urls = line.match(URL_RE) ?? []
    const label = clean(line.replace(URL_RE, '').replace(/[:\s]+$/, ''))
    const postLink = urls.map((u) => canonicalPostUrl(u)).find((l) => l !== null) ?? null
    const profile = urls.map((u) => canonicalProfileUrl(u)).find((u) => u !== null) ?? null
    if (profile) {
      // "Jane Doe https://…/in/…" or the name on the line above.
      const name = label || card.filter((l) => !isNoise(l)).at(-2) || card.at(-1) || null
      poster = { name: name ? clean(name) : null, url: profile }
      if (label) card.push(label)
      continue
    }
    if (postLink) {
      if (label && !isNoise(label)) card.push(label)
      if (!posts.has(postLink.key) && posts.size < MAX_POSTS) {
        const name = poster.name ?? posterFromSubject(subject)
        const lines = card.filter((l) => !/\b(posted|shared a post)$/i.test(l))
        posts.set(postLink.key, fromLines(lines, { name, url: poster.url }, postLink))
      }
      card = []
      poster = { name: null, url: null }
      continue
    }
    if (line) card.push(line)
  }
  return [...posts.values()].filter((p) => p.snippet || p.posterName)
}

/** Posts in one notification email: the HTML part first, the text part as a fallback. */
export function parseLinkedInPostEmail(input: PostEmailInput): ParsedPostEmail {
  let posts: EmailPost[] = []
  if (input.html) {
    try {
      posts = parsePostHtml(input.html, input.subject)
    } catch {
      posts = []
    }
  }
  if (posts.length === 0 && input.text) posts = parsePostText(input.text, input.subject)
  return { kind: kindOf(input.subject, posts.length), posts }
}
