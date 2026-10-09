import { isPublicItem } from '@/lib/resume/visibility'
import type { Highlight, ProjectItem, ResumeProfile, Skill, WorkItem } from '@/lib/resume/types'

/**
 * The lee-only overlay on top of the pulled portfolio facts, and what
 * happens to it when the portfolio drops an item. Client-safe (no I/O).
 *
 * Overlay = what the portfolio never holds: readiness / depth, owned
 * aspects, study notes and target, alternate wordings, skill kind, a work
 * item's private stack. A pull keeps it on every item it still matches
 * (lib/portfolio/reverse.ts, by the same keys). When the portfolio removes
 * an item that carried overlay, it is listed here as an orphan the user
 * can see and clear — never dropped silently.
 */

export type OrphanKind = 'work' | 'project' | 'highlight' | 'skill'

export interface OrphanOverlay {
  /** The removed item's lee id. */
  id: string
  kind: OrphanKind
  /** Its name (or the start of a highlight). */
  label: string
  /** The job, project or skill group it sat in. */
  parent: string | null
  overlay: Record<string, unknown>
  removedAt: string
}

export const MAX_ORPHANS = 200

type Readiness = Pick<Highlight, 'depth' | 'interviewReady' | 'domainReady' | 'ownedAspects' | 'studyNotes' | 'studyTarget'>

function readinessOverlay(x: Readiness): Record<string, unknown> {
  return {
    depth: x.depth,
    interviewReady: x.interviewReady,
    domainReady: x.domainReady,
    ...(x.ownedAspects ? { ownedAspects: x.ownedAspects } : {}),
    ...(x.studyNotes ? { studyNotes: x.studyNotes } : {}),
    ...(x.studyTarget ? { studyTarget: x.studyTarget } : {}),
  }
}

/** Anything worth keeping: a readiness claim, notes, wordings, a non-default kind. */
function carriesReadiness(x: Readiness): boolean {
  return x.depth !== 'own' || x.interviewReady || x.domainReady || Boolean(x.ownedAspects || x.studyNotes || x.studyTarget)
}

function highlightOrphan(h: Highlight, parent: string, at: string): OrphanOverlay | null {
  if (!carriesReadiness(h) && h.alternates.length === 0) return null
  return {
    id: h.id,
    kind: 'highlight',
    label: h.text.slice(0, 120),
    parent,
    overlay: { ...readinessOverlay(h), ...(h.alternates.length > 0 ? { alternates: h.alternates.map((a) => a.text) } : {}) },
    removedAt: at,
  }
}

function workOrphan(w: WorkItem, at: string): OrphanOverlay | null {
  return w.keywords.length > 0 ? { id: w.id, kind: 'work', label: w.name, parent: null, overlay: { keywords: w.keywords }, removedAt: at } : null
}

function projectOrphan(p: ProjectItem, at: string): OrphanOverlay | null {
  return carriesReadiness(p) ? { id: p.id, kind: 'project', label: p.name, parent: null, overlay: readinessOverlay(p), removedAt: at } : null
}

function skillOrphan(s: Skill, parent: string, at: string): OrphanOverlay | null {
  if (!carriesReadiness(s) && s.kind === 'tech') return null
  return { id: s.id, kind: 'skill', label: s.name, parent, overlay: { ...readinessOverlay(s), kind: s.kind }, removedAt: at }
}

function idsOf(p: ResumeProfile): Set<string> {
  return new Set([
    ...p.work.flatMap((w) => [w.id, ...w.highlights.map((h) => h.id)]),
    ...p.projects.flatMap((x) => [x.id, ...x.highlights.map((h) => h.id)]),
    ...p.skills.flatMap((g) => g.skills.map((s) => s.id)),
  ])
}

/** Public items of `before` that `after` no longer has, with the overlay they carried. */
export function findOrphans(before: ResumeProfile, after: ResumeProfile, now: Date): OrphanOverlay[] {
  const kept = idsOf(after)
  const at = now.toISOString()
  const gone = (id: string): boolean => !kept.has(id)
  const out: Array<OrphanOverlay | null> = []
  for (const w of before.work.filter((x) => isPublicItem('work', x))) {
    if (gone(w.id)) out.push(workOrphan(w, at))
    for (const h of w.highlights) if (isPublicItem('highlight', h) && gone(h.id)) out.push(highlightOrphan(h, w.name, at))
  }
  for (const p of before.projects.filter((x) => isPublicItem('projects', x))) {
    if (gone(p.id)) out.push(projectOrphan(p, at))
    for (const h of p.highlights) if (isPublicItem('highlight', h) && gone(h.id)) out.push(highlightOrphan(h, p.name, at))
  }
  for (const g of before.skills.filter((x) => isPublicItem('skills', x))) {
    for (const s of g.skills) if (gone(s.id)) out.push(skillOrphan(s, g.name, at))
  }
  return out.filter((o): o is OrphanOverlay => o !== null)
}

/** Newest first, one entry per id, capped. */
export function mergeOrphans(existing: readonly OrphanOverlay[], added: readonly OrphanOverlay[]): OrphanOverlay[] {
  const fresh = new Set(added.map((o) => o.id))
  return [...added, ...existing.filter((o) => !fresh.has(o.id))].slice(0, MAX_ORPHANS)
}

export function parseOrphans(value: unknown): OrphanOverlay[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (o): o is OrphanOverlay =>
      typeof o === 'object' && o !== null && typeof (o as OrphanOverlay).id === 'string' && typeof (o as OrphanOverlay).label === 'string',
  )
}

const lower = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase() : '')

function names(list: unknown, key: string): Set<string> {
  return new Set(Array.isArray(list) ? list.map((x) => lower((x as Record<string, unknown> | null)?.[key])) : [])
}

function keepPrivate<T extends { visibility: Record<string, 'public' | 'private'> }>(
  list: readonly T[],
  scope: Parameters<typeof isPublicItem>[0],
  inRepo: Set<string>,
  key: (x: T) => string,
): T[] {
  return list.map((x) => (isPublicItem(scope, x) && !inRepo.has(key(x).toLowerCase()) ? { ...x, visibility: { ...x.visibility, _item: 'private' as const } } : x))
}

/**
 * First pull only: items lee has that the portfolio never had are kept as
 * PRIVATE items instead of being replaced — the portfolio did not remove
 * them, it just never had them. Later pulls treat a missing item as removed.
 */
export function keepLeeOnlyItemsPrivate(profile: ResumeProfile, repo: Record<string, unknown>): ResumeProfile {
  const basics = (repo.basics ?? {}) as Record<string, unknown>
  return {
    ...profile,
    basics: {
      ...profile.basics,
      profiles: keepPrivate(profile.basics.profiles, 'profiles', names(basics.profiles, 'network'), (p) => p.network),
    },
    work: keepPrivate(profile.work, 'work', names(repo.work, 'name'), (w) => w.name),
    projects: keepPrivate(profile.projects, 'projects', names(repo.projects, 'name'), (p) => p.name),
    skills: keepPrivate(profile.skills, 'skills', names(repo.skills, 'name'), (g) => g.name),
    education: keepPrivate(profile.education, 'education', names(repo.education, 'institution'), (e) => e.institution),
    languages: keepPrivate(profile.languages, 'languages', names(repo.languages, 'language'), (l) => l.language),
    certificates: keepPrivate(profile.certificates, 'certificates', names(repo.certificates, 'name'), (c) => c.name),
  }
}
