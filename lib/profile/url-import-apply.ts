import type { NewUserProfile } from '@/lib/db/queries/profile'
import type { ImportChanges } from '@/lib/import/changes'
import { readinessFlags, type ReadinessIntention } from '@/lib/import/intentions'
import { addSkillsToGroup, type Provenance } from '@/lib/import/resume-merge'
import type { ImportItem, ReviewSelection } from '@/lib/import/types'
import { newId, type IdFactory } from '@/lib/resume/ids'
import { projectSchema, skillSchema, type ResumeProfile } from '@/lib/resume/types'
import { MAX_LINKS, type ProfileLink } from './links'
import type { StoredLinkedProfile } from './url-import'
import { ITEM_CAP } from './url-import-limits'
import { pageSkillGroup, type UrlImportContext, type UrlProposal } from './url-import-review'

/**
 * Client-safe, pure. Apply a confirmed public-page review.
 *
 * - Lee-only page evidence (experience and result lines) is saved in both
 *   modes: "Mine" lines feed role suggestions, the rest wait under
 *   `learning`.
 * - Public facts (headline, summary, skills, projects, links) are written
 *   only when `editable` (lib/profile/edit-mode.ts). Otherwise they become
 *   portfolio suggestions and the readiness chosen for skills and projects
 *   is returned as intentions.
 */

export interface UrlApplyResult {
  patch: Partial<NewUserProfile>
  /** The new master profile, or null when it does not change. */
  resume: ResumeProfile | null
  intentions: ReadinessIntention[]
  changes: ImportChanges
  counts: Record<string, number>
}

function lineIndexes(picked: readonly ImportItem[], prefix: string): number[] {
  return picked.filter((i) => i.key.startsWith(prefix)).map((i) => Number(i.key.split(':').pop()))
}

function evidence(ctx: UrlImportContext, p: UrlProposal, picked: readonly ImportItem[], mine: ReadonlySet<string>, now: string): StoredLinkedProfile | null {
  const exp = lineIndexes(picked, 'evidence:experience:')
  const met = lineIndexes(picked, 'evidence:metrics:')
  if (exp.length + met.length === 0) return null
  const prior = ctx.linked
  const ready = (idx: number[], kind: string, lines: string[]): string[] => idx.filter((i) => mine.has(`evidence:${kind}:${i}`)).map((i) => lines[i]!)
  const learning = (idx: number[], kind: string, lines: string[]): string[] => idx.filter((i) => !mine.has(`evidence:${kind}:${i}`)).map((i) => lines[i]!)
  const cap = (xs: string[]): string[] => [...new Set(xs)].slice(0, ITEM_CAP)
  return {
    url: p.url,
    fetchedAt: now,
    text: p.text,
    experience: cap([...(prior?.experience ?? []), ...ready(exp, 'experience', p.experience)]),
    projects: prior?.projects ?? [],
    metrics: cap([...(prior?.metrics ?? []), ...ready(met, 'metrics', p.metrics)]),
    learning: {
      experience: cap([...(prior?.learning.experience ?? []), ...learning(exp, 'experience', p.experience)]),
      metrics: cap([...(prior?.learning.metrics ?? []), ...learning(met, 'metrics', p.metrics)]),
    },
  }
}

function linkId(makeId: IdFactory): string {
  return makeId().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'link'
}

function applyLinks(ctx: UrlImportContext, p: UrlProposal, picked: readonly ImportItem[], makeId: IdFactory, changes: ImportChanges): ProfileLink[] | null {
  const chosen = picked.filter((i) => i.section === 'links' && i.status !== 'duplicate')
  if (chosen.length === 0) return null
  let links = [...ctx.links]
  const added: string[] = []
  const updated: NonNullable<ImportChanges['linksUpdated']> = []
  for (const it of chosen) {
    const l = p.links[Number(it.key.split(':')[1])]!
    const sameKind = links.find((x) => x.kind === l.kind)
    if (it.status === 'update' && sameKind) {
      const after = { ...sameKind, url: l.url }
      updated.push({ id: sameKind.id, before: sameKind, after })
      links = links.map((x) => (x.id === sameKind.id ? after : x))
    } else if (links.length < MAX_LINKS) {
      const id = linkId(makeId)
      added.push(id)
      links = [...links, { id, label: it.label, url: l.url, kind: l.kind }]
    }
  }
  if (added.length > 0) changes.linksAdded = added
  if (updated.length > 0) changes.linksUpdated = updated
  return links
}

export function applyUrlSelection(
  ctx: UrlImportContext,
  p: UrlProposal,
  items: readonly ImportItem[],
  sel: ReviewSelection,
  prov: Provenance,
  editable: boolean,
  makeId: IdFactory = () => newId(),
): UrlApplyResult {
  const on = new Set(sel.picked)
  const mine = new Set(sel.mine)
  const picked = items.filter((i) => on.has(i.key))
  const changes: ImportChanges = {}
  const patch: Partial<NewUserProfile> = {}
  const counts: Record<string, number> = {}

  const linked = evidence(ctx, p, picked, mine, prov.importedAt)
  if (linked) {
    changes.linkedBefore = ctx.linked
    patch.linkedProfile = linked as NewUserProfile['linkedProfile']
    counts.evidence = picked.filter((i) => i.section === 'evidence').length
  }

  const fresh = (section: string): ImportItem[] => picked.filter((i) => i.section === section && i.status === 'new')
  const skillNames = fresh('skills').map((i) => ({ name: i.label, mine: mine.has(i.key) }))
  const projectNames = fresh('projects').map((i) => ({ name: p.projects[Number(i.key.split(':')[1])]!.slice(0, 200), mine: mine.has(i.key) }))
  if (!editable) {
    const intentions: ReadinessIntention[] = [
      ...skillNames.map((s) => ({ section: 'skills' as const, ...s })),
      ...projectNames.map((s) => ({ section: 'projects' as const, ...s })),
    ]
    counts.suggested = picked.filter((i) => i.isPublic).length
    return { patch, resume: null, intentions, changes, counts }
  }

  const take = (key: string): boolean => picked.some((i) => i.key === key && i.status !== 'duplicate')
  if (take('basics:headline') && p.headline) {
    changes.headline = { before: ctx.headline, after: p.headline }
    patch.headline = p.headline
  }
  if (take('basics:summary') && p.summary) {
    changes.summaryMd = { before: ctx.summaryMd, after: p.summary }
    patch.summaryMd = p.summary
  }
  const readySkills = skillNames.filter((s) => s.mine).map((s) => s.name)
  if (readySkills.length > 0) {
    changes.skillsAdded = readySkills
    patch.skills = [...ctx.skills, ...readySkills]
  }
  const links = applyLinks(ctx, p, picked, makeId, changes)
  if (links) patch.links = links

  const skills = skillNames.map((s) => skillSchema.parse({ id: makeId(), ...prov, name: s.name, ...readinessFlags(s.mine) }))
  const projects = projectNames.map((s) => projectSchema.parse({ id: makeId(), ...prov, name: s.name, ...readinessFlags(s.mine) }))
  if (skills.length) counts.skills = skills.length
  if (projects.length) counts.projects = projects.length
  const resume =
    skills.length + projects.length === 0
      ? null
      : { ...ctx.resume, skills: addSkillsToGroup(ctx.resume, pageSkillGroup(p.url), skills, makeId), projects: [...ctx.resume.projects, ...projects].slice(0, 40) }
  return { patch, resume, intentions: [], changes, counts }
}
