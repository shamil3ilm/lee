import type { MasterCV } from '@/lib/documents/types'
import { newId, type IdFactory } from './ids'
import { parseFluency } from './labels'
import {
  DATE_PATTERN,
  highlightSchema,
  parseResumeProfile,
  skillSchema,
  type Highlight,
  type ResumeProfile,
} from './types'

/**
 * The two places a MasterCV flows INTO the profile:
 *
 * 1. `fromMasterCv` — one-time migration of a user's legacy `master_cv`
 *    document (before the master profile existed). Every item is marked
 *    `own`: it is the CV the user wrote and saved themselves.
 * 2. `applyMasterCvEdit` (lib/resume/merge-cv.ts) — a MasterCV-level edit
 *    written back onto the profile it was derived from.
 */

/** "2021-04", "2021", "Apr 2021", "04/2021" → a JSON Resume date, or ''. */
export function toResumeDate(raw: string | undefined): string {
  const v = (raw ?? '').trim()
  if (DATE_PATTERN.test(v)) return v
  const ym = /(\d{4})[-/.](\d{1,2})/.exec(v) ?? null
  if (ym) return `${ym[1]}-${ym[2]!.padStart(2, '0')}`
  const my = /(\d{1,2})[-/.](\d{4})/.exec(v)
  if (my) return `${my[2]}-${my[1]!.padStart(2, '0')}`
  const year = /\b(19|20)\d{2}\b/.exec(v)
  return year ? year[0] : ''
}

function httpsUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`
}

function highlight(text: string, makeId: IdFactory): Highlight {
  return highlightSchema.parse({ id: makeId(), text, depth: 'own' })
}

export function fromMasterCv(cv: MasterCV, makeId: IdFactory = () => newId()): ResumeProfile {
  const b = cv.basics
  const profiles = [
    b.github ? { id: makeId(), network: 'GitHub', url: httpsUrl(b.github) } : null,
    b.linkedin ? { id: makeId(), network: 'LinkedIn', url: httpsUrl(b.linkedin) } : null,
  ].filter((p) => p !== null)
  const skillGroup = (name: string, list: readonly string[]) => ({
    id: makeId(),
    name,
    skills: list.map((s) => skillSchema.parse({ id: makeId(), name: s, depth: 'own' })),
  })
  return parseResumeProfile({
    basics: {
      name: b.name,
      label: b.headline,
      email: b.email ?? '',
      phone: b.phone ?? '',
      url: httpsUrl(b.website),
      summary: cv.summary,
      location: { city: b.location ?? '' },
      profiles,
    },
    work: cv.experience.map((e) => ({
      id: makeId(),
      name: e.company,
      position: e.role,
      location: e.location ?? '',
      startDate: toResumeDate(e.start),
      endDate: e.end === 'present' ? '' : toResumeDate(e.end),
      highlights: e.bullets.filter((t) => t.trim()).map((t) => highlight(t, makeId)),
      keywords: e.tech ?? [],
    })),
    projects: (cv.projects ?? []).map((p) => ({
      id: makeId(),
      name: p.name,
      description: p.description.slice(0, 200),
      url: httpsUrl(p.url),
      keywords: p.tech ?? [],
      highlights: (p.highlights ?? []).filter((t) => t.trim()).map((t) => highlight(t, makeId)),
      depth: 'own',
    })),
    skills: [
      ...(cv.skills.primary.length > 0 ? [skillGroup('Skills', cv.skills.primary)] : []),
      ...((cv.skills.secondary ?? []).length > 0 ? [skillGroup('More skills', cv.skills.secondary ?? [])] : []),
    ],
    education: (cv.education ?? []).map((e) => ({
      id: makeId(),
      institution: e.school,
      studyType: e.degree,
      startDate: toResumeDate(e.start),
      endDate: toResumeDate(e.end),
      score: e.honors ?? '',
    })),
    languages: (cv.languages ?? []).map((l) => ({ id: makeId(), language: l.name, fluency: parseFluency(l.proficiency) })),
    certificates: (cv.certifications ?? []).map((c) => ({
      id: makeId(),
      name: c.name,
      issuer: c.issuer,
      date: toResumeDate(c.date),
      url: httpsUrl(c.url),
    })),
    portfolio: { displayName: b.name },
  })
}
