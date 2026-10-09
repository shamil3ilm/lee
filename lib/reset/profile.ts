import { readinessFlags } from '@/lib/import/intentions'
import { inferLinkKind } from '@/lib/profile/links'
import type { ProfileLink } from '@/lib/profile/links'
import { dropDanglingCaseStudies } from '@/lib/resume/integrity'
import { emptyResumeProfile, type Highlight, type ResumeProfile } from '@/lib/resume/types'
import type { ProfileSection } from './types'

/**
 * Client-safe, pure. Master-profile resets: whole sections (only while
 * profile editing in lee is on), lee's overlay (readiness, wordings) and
 * study notes. Every function returns a new profile.
 */

const BASICS_TEXT = ['name', 'label', 'email', 'phone', 'url', 'summary', 'image', 'nationality', 'visaStatus', 'noticePeriod', 'dateOfBirth', 'maritalStatus', 'expectedSalary'] as const

function basicsCount(p: ResumeProfile): number {
  const b = p.basics
  const loc = Object.values(b.location).filter(Boolean).length > 0 ? 1 : 0
  return BASICS_TEXT.filter((k) => b[k] !== '').length + loc + b.profiles.length
}

export function sectionCount(p: ResumeProfile, s: ProfileSection): number {
  if (s === 'basics') return basicsCount(p)
  if (s === 'skills') return p.skills.reduce((n, g) => n + g.skills.length, 0)
  return p[s].length
}

export function sectionLabels(p: ResumeProfile, s: ProfileSection): string[] {
  switch (s) {
    case 'basics':
      return [...BASICS_TEXT.filter((k) => p.basics[k] !== '').map((k) => k), ...p.basics.profiles.map((x) => `${x.network} link`)]
    case 'work':
      return p.work.map((w) => `${w.position} · ${w.name}`)
    case 'projects':
      return p.projects.map((x) => x.name)
    case 'skills':
      return p.skills.flatMap((g) => g.skills.map((x) => x.name))
    case 'education':
      return p.education.map((x) => x.institution)
    case 'certificates':
      return p.certificates.map((x) => x.name)
    case 'languages':
      return p.languages.map((x) => x.language)
  }
}

export function clearSections(p: ResumeProfile, sections: readonly ProfileSection[]): ResumeProfile {
  const on = new Set(sections)
  const empty = emptyResumeProfile()
  return dropDanglingCaseStudies({
    ...p,
    basics: on.has('basics') ? empty.basics : p.basics,
    work: on.has('work') ? [] : p.work,
    projects: on.has('projects') ? [] : p.projects,
    skills: on.has('skills') ? [] : p.skills,
    education: on.has('education') ? [] : p.education,
    certificates: on.has('certificates') ? [] : p.certificates,
    languages: on.has('languages') ? [] : p.languages,
  })
}

// ---------------------------------------------------------------------------
// Overlay: readiness, wordings, link kinds
// ---------------------------------------------------------------------------

const RESET_FLAGS = readinessFlags(false)

function flagged(x: { depth: string; interviewReady: boolean; domainReady: boolean }): boolean {
  return x.depth !== RESET_FLAGS.depth || x.interviewReady || x.domainReady
}

function allHighlights(p: ResumeProfile): Highlight[] {
  return [...p.work.flatMap((w) => w.highlights), ...p.projects.flatMap((x) => x.highlights)]
}

export interface OverlayCounts {
  readiness: number
  wordings: number
  linkKinds: number
}

export function overlayCounts(p: ResumeProfile, links: readonly ProfileLink[]): OverlayCounts {
  const items = [...p.skills.flatMap((g) => g.skills), ...p.projects, ...allHighlights(p)]
  return {
    readiness: items.filter(flagged).length,
    wordings: allHighlights(p).reduce((n, h) => n + h.alternates.length, 0),
    linkKinds: links.filter((l) => l.kind !== inferLinkKind(l.url)).length,
  }
}

/** Saved wordings (alternates) removed; readiness untouched. */
export function removeWordings(p: ResumeProfile): ResumeProfile {
  const hl = (h: Highlight): Highlight => ({ ...h, alternates: [] })
  return {
    ...p,
    work: p.work.map((w) => ({ ...w, highlights: w.highlights.map(hl) })),
    projects: p.projects.map((x) => ({ ...x, highlights: x.highlights.map(hl) })),
  }
}

/** Every skill, project and highlight back to "Not ready / learning" (only when the user ticks it). */
export function resetReadiness(p: ResumeProfile): ResumeProfile {
  const hl = (h: Highlight): Highlight => ({ ...h, ...RESET_FLAGS })
  return {
    ...p,
    work: p.work.map((w) => ({ ...w, highlights: w.highlights.map(hl) })),
    projects: p.projects.map((x) => ({ ...x, ...RESET_FLAGS, highlights: x.highlights.map(hl) })),
    skills: p.skills.map((g) => ({ ...g, skills: g.skills.map((sk) => ({ ...sk, ...RESET_FLAGS })) })),
  }
}

export function resetLinkKinds(links: readonly ProfileLink[]): ProfileLink[] {
  return links.map((l) => ({ ...l, kind: inferLinkKind(l.url) }))
}

// ---------------------------------------------------------------------------
// Study notes
// ---------------------------------------------------------------------------

type StudyFields = { ownedAspects: string; studyNotes: string; studyTarget: string }
const hasNotes = (x: StudyFields): boolean => Boolean(x.ownedAspects || x.studyNotes || x.studyTarget)
const cleared = <T extends StudyFields>(x: T): T => ({ ...x, ownedAspects: '', studyNotes: '', studyTarget: '' })

export function studyNoteLabels(p: ResumeProfile): string[] {
  return [
    ...p.projects.filter(hasNotes).map((x) => x.name),
    ...allHighlights(p).filter(hasNotes).map((h) => h.text.slice(0, 80)),
    ...p.skills.flatMap((g) => g.skills).filter(hasNotes).map((s) => s.name),
  ]
}

export function clearStudyNotes(p: ResumeProfile): ResumeProfile {
  const hl = (h: Highlight): Highlight => cleared(h)
  return {
    ...p,
    work: p.work.map((w) => ({ ...w, highlights: w.highlights.map(hl) })),
    projects: p.projects.map((x) => ({ ...cleared(x), highlights: x.highlights.map(hl) })),
    skills: p.skills.map((g) => ({ ...g, skills: g.skills.map(cleared) })),
  }
}
