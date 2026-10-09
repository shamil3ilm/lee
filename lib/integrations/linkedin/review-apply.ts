import { readinessFlags, nameKey as key } from '@/lib/import/intentions'
import { addSkillsToGroup, type Provenance, type UpdatedItem } from '@/lib/import/resume-merge'
import type { ImportItem, ReviewSelection } from '@/lib/import/types'
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
import { bulletLines, httpsOrEmpty, LINKEDIN_SKILL_GROUP, proseOf } from './review'

/**
 * Client-safe, pure. Write the confirmed LinkedIn review into the master
 * profile (only while profile editing in lee is on). Ticked NEW items are
 * added with provenance (`source: 'linkedin'`, `importedAt`) and the
 * readiness the user chose; ticked UPDATES take LinkedIn's differing fields
 * (the previous item is returned for Undo); duplicates are never added.
 */

export interface LinkedInApplyResult {
  profile: ResumeProfile
  updated: UpdatedItem[]
  counts: Record<string, number>
}

function indexes(items: readonly ImportItem[], sel: ReviewSelection, section: string, status: ImportItem['status']): number[] {
  const on = new Set(sel.picked)
  return items.filter((i) => i.section === section && i.status === status && on.has(i.key)).map((i) => Number(i.key.split(':')[1]))
}

function count(counts: Record<string, number>, section: string, n: number): void {
  if (n > 0) counts[section] = (counts[section] ?? 0) + n
}

export function applyLinkedInSelection(
  profile: ResumeProfile,
  data: LinkedInExport,
  items: readonly ImportItem[],
  sel: ReviewSelection,
  prov: Provenance,
  makeId: IdFactory = () => newId(),
): LinkedInApplyResult {
  const mine = new Set(sel.mine)
  const fresh = (section: string): number[] => indexes(items, sel, section, 'new')
  const take = (section: string): number[] => indexes(items, sel, section, 'update')
  const counts: Record<string, number> = {}
  const updated: UpdatedItem[] = []

  const work = fresh('work').map((i) => {
    const p = data.positions[i]!
    const flags = readinessFlags(mine.has(`work:${i}`))
    return workSchema.parse({
      id: makeId(),
      ...prov,
      name: p.company,
      position: p.title,
      location: p.location,
      startDate: p.startDate,
      endDate: p.endDate,
      summary: proseOf(p.description),
      highlights: bulletLines(p.description).map((text) => highlightSchema.parse({ id: makeId(), text, ...flags })),
    })
  })
  const education = fresh('education').map((i) => {
    const e = data.education[i]!
    return educationSchema.parse({ id: makeId(), ...prov, institution: e.school, studyType: e.degree, startDate: e.startDate, endDate: e.endDate })
  })
  const skills = fresh('skills').map((i) => skillSchema.parse({ id: makeId(), ...prov, name: data.skills[i]!, ...readinessFlags(mine.has(`skills:${i}`)) }))
  const certificates = fresh('certificates').map((i) => {
    const c = data.certifications[i]!
    return certificateSchema.parse({ id: makeId(), ...prov, name: c.name, issuer: c.authority, date: c.date, url: httpsOrEmpty(c.url) })
  })
  const projects = fresh('projects').map((i) => {
    const p = data.projects[i]!
    return projectSchema.parse({
      id: makeId(),
      ...prov,
      name: p.title,
      description: proseOf(p.description).slice(0, 200),
      url: httpsOrEmpty(p.url),
      startDate: p.startDate,
      endDate: p.endDate,
      ...readinessFlags(mine.has(`projects:${i}`)),
    })
  })
  const languages = fresh('languages').map((i) => {
    const l = data.languages[i]!
    return languageItemSchema.parse({ id: makeId(), ...prov, language: l.name, fluency: parseFluency(l.proficiency) })
  })
  for (const [s, list] of Object.entries({ work, education, skills, certificates, projects, languages })) count(counts, s, list.length)

  // Updates: only the fields the diff showed, onto the existing item.
  const patch = <T extends { id: string }>(
    section: UpdatedItem['section'],
    list: readonly T[],
    idxs: number[],
    find: (i: number) => T | undefined,
    fields: (i: number) => Record<string, unknown>,
  ): T[] => {
    const byId = new Map<string, Record<string, unknown>>()
    for (const i of idxs) {
      const cur = find(i)
      if (!cur || byId.has(cur.id)) continue
      updated.push({ section, id: cur.id, before: cur })
      byId.set(cur.id, fields(i))
    }
    count(counts, `${section}Updated`, byId.size)
    return list.map((x) => (byId.has(x.id) ? ({ ...x, ...byId.get(x.id) } as T) : x))
  }
  const nonEmpty = (o: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''))
  const workAfter = patch('work', profile.work, take('work'), (i) => profile.work.find((w) => key(w.name) === key(data.positions[i]!.company) && key(w.position) === key(data.positions[i]!.title)), (i) => {
    const p = data.positions[i]!
    return nonEmpty({ startDate: p.startDate, endDate: p.endDate, location: p.location })
  })
  const eduAfter = patch('education', profile.education, take('education'), (i) => profile.education.find((x) => key(x.institution) === key(data.education[i]!.school)), (i) => {
    const e = data.education[i]!
    return nonEmpty({ studyType: e.degree, startDate: e.startDate, endDate: e.endDate })
  })
  const certAfter = patch('certificates', profile.certificates, take('certificates'), (i) => profile.certificates.find((x) => key(x.name) === key(data.certifications[i]!.name)), (i) => {
    const c = data.certifications[i]!
    return nonEmpty({ issuer: c.authority, date: c.date, url: httpsOrEmpty(c.url) })
  })
  const projAfter = patch('projects', profile.projects, take('projects'), (i) => profile.projects.find((x) => key(x.name) === key(data.projects[i]!.title)), (i) => {
    const p = data.projects[i]!
    return nonEmpty({ startDate: p.startDate, endDate: p.endDate, url: httpsOrEmpty(p.url) })
  })
  const langAfter = patch('languages', profile.languages, take('languages'), (i) => profile.languages.find((x) => key(x.language) === key(data.languages[i]!.name)), (i) => ({
    fluency: parseFluency(data.languages[i]!.proficiency),
  }))

  return {
    profile: {
      ...profile,
      work: [...workAfter, ...work].slice(0, 40),
      education: [...eduAfter, ...education].slice(0, 20),
      skills: addSkillsToGroup(profile, LINKEDIN_SKILL_GROUP, skills, makeId),
      certificates: [...certAfter, ...certificates].slice(0, 40),
      projects: [...projAfter, ...projects].slice(0, 40),
      languages: [...langAfter, ...languages].slice(0, 20),
    },
    updated,
    counts,
  }
}
