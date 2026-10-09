import { z } from 'zod'
import { normalizeForMatch } from '@/lib/discovery/relevance/text'
import type { ImportItem, ItemStatus } from '@/lib/import/types'
import type { ResumeProfile } from '@/lib/resume/types'
import { LINK_KIND_LABELS, LINK_KINDS, type ProfileLink } from './links'
import type { PageSections, StoredLinkedProfile } from './url-import'
import { ITEM_CAP, ITEM_MAX } from './url-import-limits'

/**
 * Client-safe, pure. The public-page import as review items:
 *   basics    headline and summary (update: shown as a diff)
 *   skills    AI-parsed skills plus known terms on the page (chips)
 *   projects  project lines → master-profile projects
 *   links     GitHub / LinkedIn links on the page (update when the same
 *             kind already points elsewhere)
 *   evidence  experience and result lines kept as lee-only page evidence
 * Applying lives in ./url-import-apply.ts.
 */

/** https only: proposals come back from the client and links may be saved. */
const httpsUrl = z.string().max(500).url().refine((v) => /^https:\/\//i.test(v), 'Use an https:// address')

export const pageLinkSchema = z.object({ url: httpsUrl, kind: z.enum(LINK_KINDS) })

/** What the preview found on the page; sent to the client and back, re-checked on apply. */
export const urlProposalSchema = z.object({
  url: httpsUrl,
  headline: z.string().max(300).nullable(),
  summary: z.string().max(2000).nullable(),
  skills: z.array(z.string().max(80)).max(40),
  experience: z.array(z.string().max(ITEM_MAX)).max(ITEM_CAP),
  projects: z.array(z.string().max(ITEM_MAX)).max(ITEM_CAP),
  metrics: z.array(z.string().max(ITEM_MAX)).max(ITEM_CAP),
  links: z.array(pageLinkSchema).max(6),
  text: z.string().max(12_000),
})
export type UrlProposal = z.infer<typeof urlProposalSchema>

export interface UrlImportContext {
  headline: string | null
  summaryMd: string | null
  /** The flat profile skill list (Settings › Profile › Details). */
  skills: readonly string[]
  resume: ResumeProfile
  links: readonly ProfileLink[]
  linked: StoredLinkedProfile | null
}

const norm = (s: string): string => normalizeForMatch(s)

/** `terms`: known skill / domain terms on the page (detectTerms in ./url-import.ts). */
export function proposalFrom(
  url: string,
  sections: PageSections,
  parsed: { headline?: string | null; summary_md?: string | null; skills?: string[] } | null,
  terms: readonly string[],
): UrlProposal {
  const seen = new Set<string>()
  const skills = [...(parsed?.skills ?? []), ...terms].filter((s) => {
    const k = norm(s)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
  return {
    url,
    headline: parsed?.headline?.trim().slice(0, 300) || null,
    summary: parsed?.summary_md?.trim().slice(0, 2000) || null,
    skills: skills.slice(0, 40),
    experience: sections.experience,
    projects: sections.projects,
    metrics: sections.metrics,
    links: sections.links,
    text: sections.text,
  }
}

function textItem(key: string, label: string, mine: string | null, imported: string | null, path: 'basics.label' | 'basics.summary'): ImportItem[] {
  if (!imported) return []
  const status: ItemStatus = !mine ? 'new' : mine.trim() === imported.trim() ? 'duplicate' : 'update'
  return [
    {
      key,
      section: 'basics',
      label,
      detail: status === 'update' ? '' : imported,
      status,
      diff: status === 'update' ? [{ field: key, label, mine: mine ?? '', imported }] : [],
      hasReadiness: false,
      isPublic: true,
      json: { path, value: imported },
    },
  ]
}

function linkItems(p: UrlProposal, ctx: UrlImportContext): ImportItem[] {
  return p.links.map((l, i) => {
    const same = ctx.links.find((x) => x.url.replace(/\/$/, '').toLowerCase() === l.url.toLowerCase())
    const sameKind = ctx.links.find((x) => x.kind === l.kind)
    const status: ItemStatus = same ? 'duplicate' : sameKind ? 'update' : 'new'
    return {
      key: `links:${i}`,
      section: 'links',
      label: LINK_KIND_LABELS[l.kind],
      detail: status === 'update' ? '' : l.url,
      status,
      diff: status === 'update' && sameKind ? [{ field: 'url', label: `${LINK_KIND_LABELS[l.kind]} link`, mine: sameKind.url, imported: l.url }] : [],
      hasReadiness: false,
      isPublic: true,
      json: { path: 'basics.profiles', value: { network: LINK_KIND_LABELS[l.kind], url: l.url } },
    }
  })
}

export function buildUrlImportItems(p: UrlProposal, ctx: UrlImportContext): ImportItem[] {
  const skillsHave = new Set([...ctx.skills, ...ctx.resume.skills.flatMap((g) => g.skills.map((s) => s.name))].map(norm))
  const projectsHave = new Set([...ctx.resume.projects.map((x) => x.name), ...(ctx.linked?.projects ?? [])].map(norm))
  const evidenceHave = new Set(
    [...(ctx.linked?.experience ?? []), ...(ctx.linked?.metrics ?? []), ...(ctx.linked?.learning.experience ?? []), ...(ctx.linked?.learning.metrics ?? [])].map(norm),
  )
  const plain = (key: string, section: ImportItem['section'], label: string, dup: boolean, isPublic: boolean, json: ImportItem['json']): ImportItem => ({
    key,
    section,
    label,
    detail: '',
    status: dup ? 'duplicate' : 'new',
    diff: [],
    hasReadiness: !dup,
    isPublic,
    json,
  })
  return [
    ...textItem('basics:headline', 'Headline', ctx.headline, p.headline, 'basics.label'),
    ...textItem('basics:summary', 'Summary', ctx.summaryMd, p.summary, 'basics.summary'),
    ...p.skills.map((s, i) => plain(`skills:${i}`, 'skills', s, skillsHave.has(norm(s)), true, { path: 'skills', value: s })),
    ...p.projects.map((s, i) => plain(`projects:${i}`, 'projects', s, projectsHave.has(norm(s)), true, { path: 'projects', value: { name: s.slice(0, 200) } })),
    ...linkItems(p, ctx),
    ...p.experience.map((s, i) => ({ ...plain(`evidence:experience:${i}`, 'evidence', s, evidenceHave.has(norm(s)), false, null), detail: 'Experience' })),
    ...p.metrics.map((s, i) => ({ ...plain(`evidence:metrics:${i}`, 'evidence', s, evidenceHave.has(norm(s)), false, null), detail: 'Result' })),
  ]
}

/** "From alex.example": the skill group page skills are added to. */
export function pageSkillGroup(url: string): string {
  try {
    return `From ${new URL(url).hostname.replace(/^www\./, '')}`.slice(0, 200)
  } catch {
    return 'From a public page'
  }
}
