import { newId, type IdFactory } from '@/lib/resume/ids'
import { parseFluency } from '@/lib/resume/labels'
import {
  certificateSchema,
  educationSchema,
  highlightSchema,
  languageItemSchema,
  projectSchema,
  skillSchema,
  workSchema,
  type ResumeProfile,
} from '@/lib/resume/types'
import type { LinkedInExport } from './export/parse'

/**
 * Client-safe, pure. The import review: every position, school, skill,
 * certification, project and language from the export is a SUGGESTION
 * with a status — `new` (not in the master profile) or `duplicate`
 * (already there, never added twice). Nothing is applied until the user
 * ticks items and confirms. New items with readiness flags (skills,
 * projects, highlights) are NOT ready unless the user marks them "mine".
 */

export type ImportSection = 'work' | 'education' | 'skills' | 'certificates' | 'projects' | 'languages'

export interface ImportSuggestion {
  key: string
  section: ImportSection
  label: string
  detail: string
  status: 'new' | 'duplicate'
  /** Sections whose items carry readiness flags: the user may mark them "mine". */
  hasReadiness: boolean
}

const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function range(start: string, end: string): string {
  if (!start && !end) return ''
  return `${start || '?'} – ${end || 'present'}`
}

export function buildImportSuggestions(profile: ResumeProfile, data: LinkedInExport): ImportSuggestion[] {
  const work = new Set(profile.work.map((w) => `${key(w.name)}|${key(w.position)}`))
  const schools = new Set(profile.education.map((e) => key(e.institution)))
  const skills = new Set(profile.skills.flatMap((g) => g.skills.map((s) => key(s.name))))
  const certs = new Set(profile.certificates.map((c) => key(c.name)))
  const projects = new Set(profile.projects.map((p) => key(p.name)))
  const langs = new Set(profile.languages.map((l) => key(l.language)))
  const status = (set: Set<string>, k: string): 'new' | 'duplicate' => (set.has(k) ? 'duplicate' : 'new')
  return [
    ...data.positions.map((p, i) => ({
      key: `work:${i}`,
      section: 'work' as const,
      label: `${p.title} · ${p.company}`,
      detail: range(p.startDate, p.endDate),
      status: status(work, `${key(p.company)}|${key(p.title)}`),
      hasReadiness: bulletLines(p.description).length > 0,
    })),
    ...data.education.map((e, i) => ({
      key: `education:${i}`,
      section: 'education' as const,
      label: e.school,
      detail: [e.degree, range(e.startDate, e.endDate)].filter(Boolean).join(' · '),
      status: status(schools, key(e.school)),
      hasReadiness: false,
    })),
    ...data.skills.map((s, i) => ({ key: `skills:${i}`, section: 'skills' as const, label: s, detail: '', status: status(skills, key(s)), hasReadiness: true })),
    ...data.certifications.map((c, i) => ({
      key: `certificates:${i}`,
      section: 'certificates' as const,
      label: c.name,
      detail: [c.authority, c.date].filter(Boolean).join(' · '),
      status: status(certs, key(c.name)),
      hasReadiness: false,
    })),
    ...data.projects.map((p, i) => ({
      key: `projects:${i}`,
      section: 'projects' as const,
      label: p.title,
      detail: range(p.startDate, p.endDate),
      status: status(projects, key(p.title)),
      hasReadiness: true,
    })),
    ...data.languages.map((l, i) => ({
      key: `languages:${i}`,
      section: 'languages' as const,
      label: l.name,
      detail: l.proficiency,
      status: status(langs, key(l.name)),
      hasReadiness: false,
    })),
  ]
}

const BULLET = /^\s*(?:[-•*▪●◦]|\d+[.)])\s+/

/** Description lines written as bullets become highlights; the rest is the summary. */
export function bulletLines(description: string): string[] {
  return description
    .split(/\r?\n/)
    .filter((l) => BULLET.test(l))
    .map((l) => l.replace(BULLET, '').trim())
    .filter(Boolean)
    .slice(0, 30)
}

function proseOf(description: string): string {
  return description
    .split(/\r?\n/)
    .filter((l) => !BULLET.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)
}

/** Readiness for a new item: ready only when the user said it is theirs. */
function readiness(own: boolean): { depth: 'own'; interviewReady: boolean; domainReady: boolean } {
  return { depth: 'own', interviewReady: own, domainReady: own }
}

function httpsOrEmpty(url: string): string {
  return /^https:\/\//i.test(url) ? url.slice(0, 500) : ''
}

export interface ImportSelection {
  keys: readonly string[]
  own: readonly string[]
}

/** The master profile with the ticked NEW suggestions added. Duplicates are never added. */
export function applyImportSelection(
  profile: ResumeProfile,
  data: LinkedInExport,
  selection: ImportSelection,
  makeId: IdFactory = () => newId(),
): ResumeProfile {
  const suggestions = buildImportSuggestions(profile, data)
  const picked = new Set(suggestions.filter((s) => s.status === 'new' && selection.keys.includes(s.key)).map((s) => s.key))
  const own = new Set(selection.own)
  const idx = (k: string): number => Number(k.split(':')[1])
  const take = (section: ImportSection): number[] => [...picked].filter((k) => k.startsWith(`${section}:`)).map(idx)

  const work = take('work').map((i) => {
    const p = data.positions[i]!
    const k = `work:${i}`
    return workSchema.parse({
      id: makeId(),
      name: p.company,
      position: p.title,
      location: p.location,
      startDate: p.startDate,
      endDate: p.endDate,
      summary: proseOf(p.description),
      highlights: bulletLines(p.description).map((text) => highlightSchema.parse({ id: makeId(), text, ...readiness(own.has(k)) })),
    })
  })
  const education = take('education').map((i) => {
    const e = data.education[i]!
    return educationSchema.parse({ id: makeId(), institution: e.school, studyType: e.degree, startDate: e.startDate, endDate: e.endDate })
  })
  const newSkills = take('skills').map((i) => skillSchema.parse({ id: makeId(), name: data.skills[i]!, ...readiness(own.has(`skills:${i}`)) }))
  const certificates = take('certificates').map((i) => {
    const c = data.certifications[i]!
    return certificateSchema.parse({ id: makeId(), name: c.name, issuer: c.authority, date: c.date, url: httpsOrEmpty(c.url) })
  })
  const projects = take('projects').map((i) => {
    const p = data.projects[i]!
    return projectSchema.parse({
      id: makeId(),
      name: p.title,
      description: proseOf(p.description).slice(0, 200),
      url: httpsOrEmpty(p.url),
      startDate: p.startDate,
      endDate: p.endDate,
      ...readiness(own.has(`projects:${i}`)),
    })
  })
  const languages = take('languages').map((i) => {
    const l = data.languages[i]!
    return languageItemSchema.parse({ id: makeId(), language: l.name, fluency: parseFluency(l.proficiency) })
  })

  const GROUP = 'From LinkedIn'
  const existing = profile.skills.find((g) => g.name === GROUP)
  const skills =
    newSkills.length === 0
      ? profile.skills
      : existing
        ? profile.skills.map((g) => (g === existing ? { ...g, skills: [...g.skills, ...newSkills].slice(0, 60) } : g))
        : [...profile.skills, { id: makeId(), name: GROUP, level: '', skills: newSkills.slice(0, 60), visibility: {} }]

  return {
    ...profile,
    work: [...profile.work, ...work].slice(0, 40),
    education: [...profile.education, ...education].slice(0, 20),
    skills,
    certificates: [...profile.certificates, ...certificates].slice(0, 40),
    projects: [...profile.projects, ...projects].slice(0, 40),
    languages: [...profile.languages, ...languages].slice(0, 20),
  }
}
