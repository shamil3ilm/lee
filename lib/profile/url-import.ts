import * as cheerio from 'cheerio'
import { z } from 'zod'
import type { NewUserProfile, UserProfile } from '@/lib/db/queries/profile'
import type { ParsedProfile } from '@/lib/ai/types'
import { SKILL_GROUPS, ROLE_FAMILIES } from '@/lib/discovery/relevance/roles'
import { findTerms, normalizeForMatch } from '@/lib/discovery/relevance/text'

/**
 * Import a profile from a public résumé or portfolio page. The page is
 * fetched server-side through the SSRF-safe fetcher (lib/ingest/fetch.ts:
 * https only, no private hosts, 2 MB cap, 10 s timeout, redirects
 * re-checked); this module only turns its HTML into sections and a
 * per-section diff. Nothing is saved until the user confirms sections.
 */

export interface PageSections {
  /** Visible text (scripts, styles, nav and forms removed), capped. */
  text: string
  experience: string[]
  projects: string[]
  /** Sentences with a measurable result ("cut latency 40%", "10k users"). */
  metrics: string[]
}

const TEXT_CAP = 12_000
const ITEM_CAP = 40
const ITEM_MAX = 300

const EXPERIENCE_HEADING = /\b(experience|employment|work history|career|positions?)\b/i
const PROJECTS_HEADING = /\b(projects?|case stud(y|ies)|portfolio|selected work)\b/i
const METRIC = /(\d[\d,.]*\s?(%|x\b|ms\b|k\b|m\b|\+)|\b\d[\d,.]*\s+(users|customers|merchants|transactions|requests|tenants|clients|payments)\b|\$\s?\d)/i

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, ITEM_MAX)
}

/** Split the page into experience / projects sections by heading, plus metric sentences. */
export function extractPageSections(html: string): PageSections {
  const $ = cheerio.load(html)
  $('script, style, noscript, iframe, svg, nav, form, template').remove()
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
  return { text, experience, projects, metrics }
}

/** Every known skill / domain term on the page, in its canonical spelling. */
export function detectTerms(text: string): string[] {
  const all = new Set<string>([...Object.values(SKILL_GROUPS).flat(), ...ROLE_FAMILIES.flatMap((f) => f.skills)])
  // Short ambiguous words need context a page rarely gives; skip them.
  const terms = [...all].filter((t) => t.length > 2 && !['api', 'apis', 'sql', 'go', 'qa', 'rag', 'iam', 'sla', 'ach'].includes(t))
  return findTerms(normalizeForMatch(text), terms)
}

export interface StoredLinkedProfile {
  url: string
  fetchedAt: string
  text: string
  experience: string[]
  projects: string[]
  metrics: string[]
}

export const linkedProfileSchema = z.object({
  url: z.string().max(500),
  fetchedAt: z.string().max(40),
  text: z.string().max(TEXT_CAP),
  experience: z.array(z.string().max(ITEM_MAX)).max(ITEM_CAP),
  projects: z.array(z.string().max(ITEM_MAX)).max(ITEM_CAP),
  metrics: z.array(z.string().max(ITEM_MAX)).max(ITEM_CAP),
})

export function readLinkedProfile(value: unknown): StoredLinkedProfile | null {
  const p = linkedProfileSchema.safeParse(value)
  return p.success ? p.data : null
}

export const IMPORT_SECTIONS = ['skills', 'headline', 'summary', 'experience', 'projects', 'metrics'] as const
export type ImportSection = (typeof IMPORT_SECTIONS)[number]

/** Proposed changes, section by section (only what differs from today). */
export interface ImportProposal {
  url: string
  skills: { add: string[]; current: string[] }
  headline: { from: string | null; to: string } | null
  summary: { from: string | null; to: string } | null
  experience: { add: string[] }
  projects: { add: string[] }
  metrics: { add: string[] }
  /** Kept for saving: the page text used for suggestions and scoring. */
  text: string
}

function newItems(proposed: readonly string[], existing: readonly string[]): string[] {
  const have = new Set(existing.map((e) => normalizeForMatch(e)))
  return proposed.filter((p) => !have.has(normalizeForMatch(p)))
}

/**
 * Diff the page (and the optional AI parse of it) against the profile.
 * Skills: AI-parsed skills plus every known domain term on the page that
 * the profile does not list yet.
 */
export function proposeImport(args: {
  url: string
  profile: Pick<UserProfile, 'skills' | 'headline' | 'summaryMd' | 'linkedProfile'> | null
  sections: PageSections
  parsed: ParsedProfile | null
}): ImportProposal {
  const { profile, sections, parsed } = args
  const current = profile?.skills ?? []
  const candidates = [...(parsed?.skills ?? []), ...detectTerms(sections.text)]
  const dedup: string[] = []
  for (const c of candidates) {
    if (!dedup.some((d) => normalizeForMatch(d) === normalizeForMatch(c))) dedup.push(c)
  }
  const prior = readLinkedProfile(profile?.linkedProfile)
  const headline = parsed?.headline?.trim()
  const summary = parsed?.summary_md?.trim()
  return {
    url: args.url,
    skills: { add: newItems(dedup, current).slice(0, 40), current },
    headline: headline && headline !== profile?.headline ? { from: profile?.headline ?? null, to: headline } : null,
    summary: summary && summary !== profile?.summaryMd ? { from: profile?.summaryMd ?? null, to: summary } : null,
    experience: { add: newItems(sections.experience, prior?.experience ?? []) },
    projects: { add: newItems(sections.projects, prior?.projects ?? []) },
    metrics: { add: newItems(sections.metrics, prior?.metrics ?? []) },
    text: sections.text,
  }
}

/**
 * The profile patch for the sections the user accepted. Experience,
 * projects and metrics are stored on `linked_profile` (merged with what an
 * earlier import kept); skills are appended; headline/summary replaced.
 */
export function applyImport(
  profile: Pick<UserProfile, 'skills' | 'linkedProfile'> | null,
  proposal: ImportProposal,
  accepted: ReadonlySet<ImportSection>,
  now: Date = new Date(),
): Partial<NewUserProfile> {
  const patch: Partial<NewUserProfile> = {}
  if (accepted.has('skills') && proposal.skills.add.length > 0) {
    patch.skills = [...(profile?.skills ?? []), ...proposal.skills.add]
  }
  if (accepted.has('headline') && proposal.headline) patch.headline = proposal.headline.to
  if (accepted.has('summary') && proposal.summary) patch.summaryMd = proposal.summary.to
  const prior = readLinkedProfile(profile?.linkedProfile)
  const keep = (s: 'experience' | 'projects' | 'metrics'): string[] =>
    [...(prior?.[s] ?? []), ...(accepted.has(s) ? proposal[s].add : [])].slice(0, ITEM_CAP)
  if (accepted.size > 0) {
    const linked: StoredLinkedProfile = {
      url: proposal.url,
      fetchedAt: now.toISOString(),
      text: proposal.text.slice(0, TEXT_CAP),
      experience: keep('experience'),
      projects: keep('projects'),
      metrics: keep('metrics'),
    }
    patch.linkedProfile = linked as NewUserProfile['linkedProfile']
  }
  return patch
}
