import type { MasterCV, TailoredCV } from '@/lib/documents/types'
import { formatMonth } from '@/lib/variants/render'
import { joinHeading, joinMeta, type DocxPaper, type DocxResume, type DocxSection } from './model'

/**
 * A stored CV document (master or tailored, the MasterCV shape) → the Word
 * model. Dates may be ISO ("2021-04") or already formatted ("Apr 2021", from
 * a variant-based tailoring); both come out as "Apr 2021 – Present".
 */

function when(date: string | undefined): string {
  if (!date) return ''
  if (date.toLowerCase() === 'present') return 'Present'
  return /^\d{4}(?:-\d{2})?/.test(date) ? formatMonth(date) : date
}

function range(start: string | undefined, end: string | undefined): string {
  return [when(start), when(end)].filter(Boolean).join(' – ')
}

function sections(cv: MasterCV): DocxSection[] {
  const out: DocxSection[] = []
  const add = (heading: string, s: Omit<DocxSection, 'heading'>): void => {
    if (s.paragraphs.length > 0 || s.entries.length > 0) out.push({ heading, ...s })
  }
  add('Summary', { paragraphs: cv.summary ? [cv.summary] : [], entries: [] })
  add('Experience', {
    paragraphs: [],
    entries: cv.experience.map((x) => ({
      heading: joinHeading(x.role, x.company),
      meta: joinMeta([x.location ?? '', range(x.start, x.end)]),
      detail: '',
      bullets: x.bullets,
    })),
  })
  const skills = [...cv.skills.primary, ...(cv.skills.secondary ?? [])]
  add('Skills', { paragraphs: skills.length > 0 ? [skills.join(', ')] : [], entries: [] })
  add('Projects', {
    paragraphs: [],
    entries: (cv.projects ?? []).map((x) => ({
      heading: joinHeading(x.name, x.description),
      meta: x.url ?? '',
      detail: (x.tech ?? []).join(', '),
      bullets: x.highlights ?? [],
    })),
  })
  add('Education', {
    paragraphs: (cv.education ?? []).map((x) => joinMeta([x.degree, x.school, range(x.start, x.end)]).replace(/ \| /g, ' · ')),
    entries: [],
  })
  add('Languages', { paragraphs: (cv.languages ?? []).map((x) => `${x.name} — ${x.proficiency}`), entries: [] })
  add('Certifications', {
    paragraphs: (cv.certifications ?? []).map((x) => [x.name, x.issuer !== x.name ? x.issuer : '', when(x.date)].filter(Boolean).join(' · ')),
    entries: [],
  })
  return out
}

export function cvToDocxModel(cv: MasterCV | TailoredCV, paper: DocxPaper): DocxResume {
  const b = cv.basics
  return {
    name: b.name,
    headline: b.headline,
    contact: [joinMeta([b.email ?? '', b.phone ?? '', b.location ?? '', b.website ?? '', b.linkedin ?? '', b.github ?? ''])].filter(Boolean),
    sections: sections(cv),
    paper,
  }
}
