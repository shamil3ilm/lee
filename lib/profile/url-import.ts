import * as cheerio from 'cheerio'
import { z } from 'zod'
import { SKILL_GROUPS, ROLE_FAMILIES } from '@/lib/discovery/relevance/roles'
import { findTerms, normalizeForMatch } from '@/lib/discovery/relevance/text'
import type { LinkKind } from './links'
import { ITEM_CAP, ITEM_MAX } from './url-import-limits'

/**
 * Import a profile from a public résumé or portfolio page. The page is
 * fetched server-side through the SSRF-safe fetcher (lib/ingest/fetch.ts:
 * https only, no private hosts, 2 MB cap, 10 s timeout, redirects
 * re-checked); this module only turns its HTML into sections, and keeps
 * the page evidence lee stores (`user_profile.linked_profile`). The review
 * and apply steps live in ./url-import-review.ts.
 */

export interface PageLink {
  url: string
  kind: LinkKind
}

export interface PageSections {
  /** Visible text (scripts, styles, nav and forms removed), capped. */
  text: string
  experience: string[]
  projects: string[]
  /** Sentences with a measurable result ("cut latency 40%", "10k users"). */
  metrics: string[]
  /** GitHub / LinkedIn profile links found on the page. */
  links: PageLink[]
}

const TEXT_CAP = 12_000

const EXPERIENCE_HEADING = /\b(experience|employment|work history|career|positions?)\b/i
const PROJECTS_HEADING = /\b(projects?|case stud(y|ies)|portfolio|selected work)\b/i
const METRIC = /(\d[\d,.]*\s?(%|x\b|ms\b|k\b|m\b|\+)|\b\d[\d,.]*\s+(users|customers|merchants|transactions|requests|tenants|clients|payments)\b|\$\s?\d)/i
const PROFILE_LINK: ReadonlyArray<readonly [RegExp, LinkKind]> = [
  [/^https:\/\/(www\.)?github\.com\/[A-Za-z0-9-]{1,39}\/?$/, 'github'],
  [/^https:\/\/([a-z]{2,3}\.|www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]{2,100}\/?$/, 'linkedin'],
]

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, ITEM_MAX)
}

function pageLinks($: cheerio.CheerioAPI): PageLink[] {
  const out: PageLink[] = []
  $('body a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim()
    const hit = PROFILE_LINK.find(([re]) => re.test(href))
    if (hit && !out.some((l) => l.url === href) && out.length < 6) out.push({ url: href.replace(/\/$/, ''), kind: hit[1] })
  })
  return out
}

/** Split the page into experience / projects sections by heading, plus metric sentences and profile links. */
export function extractPageSections(html: string): PageSections {
  const $ = cheerio.load(html)
  $('script, style, noscript, iframe, svg, nav, form, template').remove()
  const links = pageLinks($)
  // Block boundaries become spaces so "Name" + "Title" never run together.
  $('br').replaceWith(' ')
  $('h1, h2, h3, h4, h5, h6, p, li, div, dt, dd, td, th, section, header, footer, article').append(' ')
  const experience: string[] = []
  const projects: string[] = []
  let bucket: string[] | null = null
  $('body')
    .find('h1, h2, h3, h4, li, p, dt, dd')
    .each((_, el) => {
      const tag = el.tagName.toLowerCase()
      const text = clean($(el).text())
      if (!text) return
      if (/^h[1-4]$/.test(tag)) {
        bucket = EXPERIENCE_HEADING.test(text) ? experience : PROJECTS_HEADING.test(text) ? projects : null
        return
      }
      // A <p> inside an <li> is read with its <li>.
      if (tag === 'p' && $(el).parents('li').length > 0) return
      if (bucket && bucket.length < ITEM_CAP && !bucket.includes(text)) bucket.push(text)
    })
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, TEXT_CAP)
  const sentences = text.split(/(?<=[.!?])\s+|\s[•·|]\s/)
  const metrics = [...new Set(sentences.map(clean).filter((s) => s.length > 15 && METRIC.test(s)))].slice(0, ITEM_CAP)
  return { text, experience, projects, metrics, links }
}

/** Every known skill / domain term on the page, in its canonical spelling. */
export function detectTerms(text: string): string[] {
  const all = new Set<string>([...Object.values(SKILL_GROUPS).flat(), ...ROLE_FAMILIES.flatMap((f) => f.skills)])
  // Short ambiguous words need context a page rarely gives; skip them.
  const terms = [...all].filter((t) => t.length > 2 && !['api', 'apis', 'sql', 'go', 'qa', 'rag', 'iam', 'sla', 'ach'].includes(t))
  return findTerms(normalizeForMatch(text), terms)
}

const lines = z.array(z.string().max(ITEM_MAX)).max(ITEM_CAP)

/**
 * The page evidence lee keeps (lee-only, never published). `experience`,
 * `projects` and `metrics` are lines the user marked "Mine": they feed role
 * suggestions like the CV. Lines kept as "Not ready / learning" wait under
 * `learning` and feed nothing until the user confirms them.
 */
export const linkedProfileSchema = z.object({
  url: z.string().max(500),
  fetchedAt: z.string().max(40),
  text: z.string().max(TEXT_CAP),
  experience: lines,
  projects: lines,
  metrics: lines,
  learning: z.object({ experience: lines, metrics: lines }).default({ experience: [], metrics: [] }),
})
export type StoredLinkedProfile = z.infer<typeof linkedProfileSchema>

export function readLinkedProfile(value: unknown): StoredLinkedProfile | null {
  const p = linkedProfileSchema.safeParse(value)
  return p.success ? p.data : null
}
