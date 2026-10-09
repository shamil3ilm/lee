import { diffFields } from '@/lib/import/resume-merge'
import { nameKey as key, workName } from '@/lib/import/intentions'
import type { ImportItem, ItemStatus, FieldDiff } from '@/lib/import/types'
import { fluencyLabel, parseFluency } from '@/lib/resume/labels'
import type { ResumeProfile } from '@/lib/resume/types'
import type { LinkedInExport } from './export/parse'

/**
 * Client-safe, pure. The LinkedIn export review: every position, school,
 * skill, certification, project and language is an item with a status —
 * `new`, `duplicate` (already there, never added twice) or `update` (the
 * same item with different dates or details: the diff is shown and the
 * user keeps theirs or takes LinkedIn's). New skills, projects and
 * positions with bullet highlights carry readiness: "Not ready / learning"
 * unless the user marks them "Mine". Applying lives in ./review-apply.ts.
 */

export const LINKEDIN_SKILL_GROUP = 'From LinkedIn'

function range(start: string, end: string): string {
  if (!start && !end) return ''
  return `${start || '?'} – ${end || 'present'}`
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

export function proseOf(description: string): string {
  return description
    .split(/\r?\n/)
    .filter((l) => !BULLET.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)
}

export function httpsOrEmpty(url: string): string {
  return /^https:\/\//i.test(url) ? url.slice(0, 500) : ''
}

function status(found: boolean, diff: readonly FieldDiff[]): ItemStatus {
  if (!found) return 'new'
  return diff.length > 0 ? 'update' : 'duplicate'
}

type Base = Pick<ImportItem, 'key' | 'section' | 'label' | 'detail' | 'json'>

function item(base: Base, found: boolean, diff: FieldDiff[], readiness: boolean): ImportItem {
  const s = status(found, diff)
  return { ...base, status: s, diff: s === 'update' ? diff : [], hasReadiness: readiness && s === 'new', isPublic: true }
}

function workItems(profile: ResumeProfile, data: LinkedInExport): ImportItem[] {
  return data.positions.map((p, i) => {
    const cur = profile.work.find((w) => key(w.name) === key(p.company) && key(w.position) === key(p.title))
    const diff = cur
      ? diffFields([
          ['startDate', 'Start', cur.startDate, p.startDate],
          ['endDate', 'End', cur.endDate, p.endDate],
          ['location', 'Location', cur.location, p.location],
        ])
      : []
    const bullets = bulletLines(p.description)
    const json = {
      path: 'work' as const,
      value: { name: p.company, position: p.title, location: p.location, startDate: p.startDate, endDate: p.endDate, summary: proseOf(p.description), highlights: bullets },
    }
    return item({ key: `work:${i}`, section: 'work', label: `${p.title} · ${p.company}`, detail: range(p.startDate, p.endDate), json }, Boolean(cur), diff, bullets.length > 0)
  })
}

function educationItems(profile: ResumeProfile, data: LinkedInExport): ImportItem[] {
  return data.education.map((e, i) => {
    const cur = profile.education.find((x) => key(x.institution) === key(e.school))
    const diff = cur
      ? diffFields([
          ['studyType', 'Degree', cur.studyType, e.degree],
          ['startDate', 'Start', cur.startDate, e.startDate],
          ['endDate', 'End', cur.endDate, e.endDate],
        ])
      : []
    const json = { path: 'education' as const, value: { institution: e.school, studyType: e.degree, startDate: e.startDate, endDate: e.endDate } }
    return item({ key: `education:${i}`, section: 'education', label: e.school, detail: [e.degree, range(e.startDate, e.endDate)].filter(Boolean).join(' · '), json }, Boolean(cur), diff, false)
  })
}

function skillItems(profile: ResumeProfile, data: LinkedInExport): ImportItem[] {
  const have = new Set(profile.skills.flatMap((g) => g.skills.map((s) => key(s.name))))
  return data.skills.map((s, i) => item({ key: `skills:${i}`, section: 'skills', label: s, detail: '', json: { path: 'skills', value: s } }, have.has(key(s)), [], true))
}

function certificateItems(profile: ResumeProfile, data: LinkedInExport): ImportItem[] {
  return data.certifications.map((c, i) => {
    const cur = profile.certificates.find((x) => key(x.name) === key(c.name))
    const diff = cur
      ? diffFields([
          ['issuer', 'Issuer', cur.issuer, c.authority],
          ['date', 'Date', cur.date, c.date],
          ['url', 'Link', cur.url, httpsOrEmpty(c.url)],
        ])
      : []
    const json = { path: 'certificates' as const, value: { name: c.name, issuer: c.authority, date: c.date, url: httpsOrEmpty(c.url) } }
    return item({ key: `certificates:${i}`, section: 'certificates', label: c.name, detail: [c.authority, c.date].filter(Boolean).join(' · '), json }, Boolean(cur), diff, false)
  })
}

function projectItems(profile: ResumeProfile, data: LinkedInExport): ImportItem[] {
  return data.projects.map((p, i) => {
    const cur = profile.projects.find((x) => key(x.name) === key(p.title))
    const diff = cur
      ? diffFields([
          ['startDate', 'Start', cur.startDate, p.startDate],
          ['endDate', 'End', cur.endDate, p.endDate],
          ['url', 'Link', cur.url, httpsOrEmpty(p.url)],
        ])
      : []
    const json = {
      path: 'projects' as const,
      value: { name: p.title, description: proseOf(p.description).slice(0, 200), url: httpsOrEmpty(p.url), startDate: p.startDate, endDate: p.endDate },
    }
    return item({ key: `projects:${i}`, section: 'projects', label: p.title, detail: range(p.startDate, p.endDate), json }, Boolean(cur), diff, true)
  })
}

function languageItems(profile: ResumeProfile, data: LinkedInExport): ImportItem[] {
  return data.languages.map((l, i) => {
    const cur = profile.languages.find((x) => key(x.language) === key(l.name))
    const fluency = parseFluency(l.proficiency)
    const diff = cur && cur.fluency !== fluency ? [{ field: 'fluency', label: 'Fluency', mine: fluencyLabel(cur.fluency), imported: fluencyLabel(fluency) }] : []
    const json = { path: 'languages' as const, value: { language: l.name, fluency: fluencyLabel(fluency) } }
    return item({ key: `languages:${i}`, section: 'languages', label: l.name, detail: l.proficiency, json }, Boolean(cur), diff, false)
  })
}

export function buildImportItems(profile: ResumeProfile, data: LinkedInExport): ImportItem[] {
  return [
    ...workItems(profile, data),
    ...educationItems(profile, data),
    ...skillItems(profile, data),
    ...certificateItems(profile, data),
    ...projectItems(profile, data),
    ...languageItems(profile, data),
  ]
}

/** The intention name for an item with readiness (lib/import/intentions.ts). */
export function intentionName(data: LinkedInExport, itemKey: string): { section: 'skills' | 'projects' | 'work'; name: string } | null {
  const [section, raw] = itemKey.split(':')
  const i = Number(raw)
  if (section === 'skills' && data.skills[i]) return { section, name: data.skills[i] }
  if (section === 'projects' && data.projects[i]) return { section, name: data.projects[i].title }
  if (section === 'work' && data.positions[i]) return { section, name: workName(data.positions[i].company, data.positions[i].title) }
  return null
}
