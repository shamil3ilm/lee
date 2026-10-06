import type { Depth, Highlight, ProjectItem, ResumeProfile } from './types'

/**
 * Settings › Profile › Study list: every ai_assisted / learning project,
 * highlight and skill, with notes, a target date and the readiness flags.
 * Marking an item ready flips `interviewReady` (and with it `domainReady`).
 */

export type StudyKind = 'project' | 'highlight' | 'skill'

export interface StudyItem {
  kind: StudyKind
  id: string
  label: string
  /** Where it lives ("PayFlow", "Open Ledger", "Languages"). */
  context: string
  depth: Depth
  interviewReady: boolean
  domainReady: boolean
  ownedAspects: string
  studyNotes: string
  studyTarget: string
}

interface StudyFields {
  id: string
  depth: Depth
  interviewReady: boolean
  domainReady: boolean
  ownedAspects: string
  studyNotes: string
  studyTarget: string
}

function toItem(kind: StudyKind, item: StudyFields, label: string, context: string): StudyItem {
  const { id, depth, interviewReady, domainReady, ownedAspects, studyNotes, studyTarget } = item
  return { kind, id, label, context, depth, interviewReady, domainReady, ownedAspects, studyNotes, studyTarget }
}

const flagged = (r: { depth: Depth }): boolean => r.depth !== 'own'

/** Every ai_assisted / learning item, in profile order. */
export function studyList(profile: ResumeProfile): StudyItem[] {
  const out: StudyItem[] = []
  for (const w of profile.work) {
    for (const h of w.highlights) if (flagged(h)) out.push(toItem('highlight', h, h.text, w.name))
  }
  for (const p of profile.projects) {
    if (flagged(p)) out.push(toItem('project', p, p.name, 'Project'))
    for (const h of p.highlights) if (flagged(h)) out.push(toItem('highlight', h, h.text, p.name))
  }
  for (const g of profile.skills) {
    for (const s of g.skills) if (flagged(s)) out.push(toItem('skill', s, s.name, g.name))
  }
  return out
}

export interface StudyPatch {
  interviewReady?: boolean
  domainReady?: boolean
  depth?: Depth
  ownedAspects?: string
  studyNotes?: string
  studyTarget?: string
}

function patchItem<T extends StudyFields>(item: T, id: string, patch: StudyPatch): T {
  if (item.id !== id) return item
  const next = { ...item, ...patch }
  // Ready implies domain-ready; un-readying the domain un-readies the item.
  if (patch.interviewReady === true) return { ...next, domainReady: true }
  if (patch.domainReady === false) return { ...next, interviewReady: false }
  return next
}

function patchHighlights(list: readonly Highlight[], id: string, patch: StudyPatch): Highlight[] {
  return list.map((h) => patchItem(h, id, patch))
}

/** A new profile with one project / highlight / skill's study fields patched. */
export function patchStudyItem(profile: ResumeProfile, id: string, patch: StudyPatch): ResumeProfile {
  return {
    ...profile,
    work: profile.work.map((w) => ({ ...w, highlights: patchHighlights(w.highlights, id, patch) })),
    projects: profile.projects.map(
      (p): ProjectItem => ({ ...patchItem(p, id, patch), highlights: patchHighlights(p.highlights, id, patch) }),
    ),
    skills: profile.skills.map((g) => ({ ...g, skills: g.skills.map((s) => patchItem(s, id, patch)) })),
  }
}

/** True when `id` names a project, highlight or skill in the profile. */
export function hasStudyTarget(profile: ResumeProfile, id: string): boolean {
  return (
    profile.work.some((w) => w.highlights.some((h) => h.id === id)) ||
    profile.projects.some((p) => p.id === id || p.highlights.some((h) => h.id === id)) ||
    profile.skills.some((g) => g.skills.some((s) => s.id === id))
  )
}
