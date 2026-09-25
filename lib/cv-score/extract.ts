/**
 * v12.0 — turn any CV source into a `ScorableCv`.
 *
 * - Structured sources (master / tailored CV JSON) are mapped directly — best
 *   fidelity, no parsing ambiguity.
 * - Text sources (uploads, LaTeX stripped to text) go through a heuristic
 *   segmenter: known section headings, bullet markers, date-range role
 *   headers, contact regexes, and a multi-column layout heuristic.
 */
import type { MasterCV, TailoredCV } from '@/lib/documents/types'
import { latexToText } from './latex-text'
import { parseCvDate, parseDateRange } from './dates'
import type { CvSourceKind, ScorableCv, ScorableRole } from './types'
import { wordCount } from './text'

export type CvSourceInput =
  | { kind: 'master_cv' | 'tailored_cv'; cv: MasterCV | TailoredCV }
  | { kind: 'latex_cv'; source: string }
  | { kind: 'upload'; text: string; fileType: string; pageCount?: number }

/** Canonical section keys → heading spellings recognised in text CVs. */
export const SECTION_HEADINGS: Record<string, string[]> = {
  summary: ['summary', 'professional summary', 'profile', 'about', 'about me', 'objective', 'career objective', 'career summary', 'overview'],
  experience: ['experience', 'work experience', 'professional experience', 'work history', 'employment', 'employment history', 'career history', 'relevant experience', 'experience highlights'],
  education: ['education', 'academic background', 'education and training', 'qualifications', 'academics'],
  skills: ['skills', 'technical skills', 'core skills', 'key skills', 'core competencies', 'competencies', 'technologies', 'tech stack', 'tools', 'skills & tools', 'skills and tools'],
  projects: ['projects', 'personal projects', 'selected projects', 'side projects', 'open source', 'key projects'],
  certifications: ['certifications', 'certificates', 'licenses', 'licenses & certifications', 'courses'],
  languages: ['languages'],
  awards: ['awards', 'honors', 'achievements', 'awards & honors'],
  publications: ['publications', 'talks', 'publications & talks'],
  volunteer: ['volunteer', 'volunteering', 'volunteer experience'],
  interests: ['interests', 'hobbies'],
}

const HEADING_LOOKUP = new Map<string, string>()
for (const [key, list] of Object.entries(SECTION_HEADINGS)) {
  for (const h of list) HEADING_LOOKUP.set(h, key)
}

const BULLET_RE = /^\s*(?:[•●▪◦‣∙·*⁃➢➤►▸✓✔-]|–|—|\d{1,2}[.)])\s+/
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g
const LOCATION_RE = /^[A-Z][A-Za-z.' -]{1,30},\s*[A-Z][A-Za-z.' -]{1,30}$/

/** Canonical section key for a heading line, or null when not a heading. */
export function headingKey(line: string): string | null {
  const t = line.trim().replace(/[:：]+$/, '').replace(/\s+/g, ' ')
  if (!t || t.length > 40) return null
  return HEADING_LOOKUP.get(t.toLowerCase()) ?? null
}

// ---------------------------------------------------------------------------
// Structured sources
// ---------------------------------------------------------------------------

function fromStructured(cv: MasterCV, kind: 'master_cv' | 'tailored_cv'): ScorableCv {
  const b = cv.basics
  const lines: string[] = [b.name, b.headline]
  const contactLine = [b.email, b.phone, b.location, b.linkedin, b.github, b.website]
    .filter(Boolean)
    .join(' | ')
  if (contactLine) lines.push(contactLine)

  const sections: ScorableCv['sections'] = []
  const bullets: ScorableCv['bullets'] = []
  const roles: ScorableRole[] = []
  const order: string[] = []

  const push = (key: string, heading: string, body: string[]): void => {
    if (body.length === 0) return
    sections.push({ heading, lines: body })
    order.push(key)
    lines.push('', heading.toUpperCase(), ...body)
  }

  if (cv.summary?.trim()) push('summary', 'Summary', [cv.summary.trim()])

  const expLines: string[] = []
  cv.experience.forEach((e, roleIndex) => {
    const start = parseCvDate(e.start, false) ?? e.start
    const end = e.end === 'present' ? 'present' : (parseCvDate(e.end, true) ?? e.end)
    expLines.push(`${e.role} — ${e.company} | ${e.start} – ${e.end}`)
    const rb = e.bullets.filter((x) => x.trim())
    for (const text of rb) {
      expLines.push(`• ${text}`)
      bullets.push({ section: 'Experience', roleIndex, text })
    }
    const tech = (e.tech ?? []).filter((t) => t.trim())
    if (tech.length) expLines.push(`Tech: ${tech.join(', ')}`)
    roles.push({ company: e.company, title: e.role, start, end, bullets: rb, ...(tech.length ? { tech } : {}) })
  })
  push('experience', 'Experience', expLines)

  const projLines: string[] = []
  for (const p of cv.projects ?? []) {
    projLines.push(p.name + (p.description ? ` — ${p.description}` : ''))
    for (const h of p.highlights ?? []) {
      projLines.push(`• ${h}`)
      bullets.push({ section: 'Projects', text: h })
    }
  }
  push('projects', 'Projects', projLines)

  push(
    'education',
    'Education',
    (cv.education ?? []).map((e) =>
      [e.degree, e.school, [e.start, e.end].filter(Boolean).join(' – ')].filter(Boolean).join(' | '),
    ),
  )

  const skillsListed = [...cv.skills.primary, ...(cv.skills.secondary ?? [])].filter((s) => s.trim())
  push('skills', 'Skills', skillsListed.length ? [skillsListed.join(', ')] : [])
  push('certifications', 'Certifications', (cv.certifications ?? []).map((c) => `${c.name} — ${c.issuer}`))
  push('languages', 'Languages', (cv.languages ?? []).map((l) => `${l.name} (${l.proficiency})`))

  const plainText = lines.join('\n')
  return {
    plainText,
    sections,
    bullets,
    roles,
    skillsListed,
    contact: { email: b.email, phone: b.phone, linkedin: b.linkedin, location: b.location },
    headline: b.headline,
    meta: {
      sourceKind: kind,
      pageCountEstimate: estimatePages(plainText),
      columnsSuspected: false,
      fileType: 'json',
      structured: true,
      sectionOrder: order,
    },
  }
}

// ---------------------------------------------------------------------------
// Text sources
// ---------------------------------------------------------------------------

export function estimatePages(text: string): number {
  // ~500 words per dense CV page.
  return Math.max(1, Math.ceil(wordCount(text) / 500))
}

/**
 * Multi-column heuristic. Text extracted from two-column PDFs tends to show
 * (a) two headings on one line, (b) wide internal gaps between cells, or
 * (c) a flood of very short interleaved fragments.
 */
export function detectColumns(lines: string[]): boolean {
  const nonEmpty = lines.map((l) => l.trimEnd()).filter((l) => l.trim().length > 0)
  if (nonEmpty.length === 0) return false
  const headingWords = [...HEADING_LOOKUP.keys()].filter((h) => !h.includes(' '))
  const twoHeadings = nonEmpty.some((l) => {
    const toks = l.toLowerCase().split(/\s{2,}|\t/).map((t) => t.trim().replace(/:$/, ''))
    return toks.filter((t) => headingWords.includes(t)).length >= 2
  })
  if (twoHeadings) return true
  const gapped = nonEmpty.filter((l) => /\S(?: {3,}|\t+)\S/.test(l.trim())).length
  if (nonEmpty.length >= 10 && gapped / nonEmpty.length >= 0.25) return true
  if (nonEmpty.length >= 25) {
    const short = nonEmpty.filter((l) => wordCount(l) <= 2 && !headingKey(l)).length
    if (short / nonEmpty.length > 0.5) return true
  }
  return false
}

const TITLE_WORDS = /\b(engineer|developer|manager|lead|director|analyst|designer|architect|consultant|scientist|intern|head|officer|specialist|administrator|founder|co-founder|cto|ceo|vp|programmer|associate|researcher|sre|devops|tech lead|principal|staff)\b/i

function parseRoleHeader(parts: string[]): { title: string; company: string } {
  const segs = parts
    .flatMap((p) => p.split(/\s+(?:\||—|–|@|at)\s+|\s+-\s+|,\s+|\t+| {3,}/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^[|,•·–—-]+$/.test(s))
  if (segs.length === 0) return { title: '', company: '' }
  const titleIdx = segs.findIndex((s) => TITLE_WORDS.test(s))
  if (titleIdx === -1) return { title: segs[0] ?? '', company: segs[1] ?? '' }
  const title = segs[titleIdx]!
  const company = segs.find((s, i) => i !== titleIdx && !LOCATION_RE.test(s)) ?? ''
  return { title, company }
}

function splitSkills(lines: string[]): string[] {
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.replace(BULLET_RE, '')
    for (const piece of line.split(/[,;|•·]| \/ /)) {
      // "Databases: Postgres" → "Postgres" (category labels aren't skills).
      const t = piece.replace(/^[^:]{1,30}:\s*/, '').trim().replace(/\.$/, '')
      if (t && t.length <= 40) out.push(t)
    }
  }
  return out
}

function detectContact(lines: string[], text: string): ScorableCv['contact'] {
  const email = EMAIL_RE.exec(text)?.[0]
  const linkedin = LINKEDIN_RE.exec(text)?.[0]
  let phone: string | undefined
  for (const line of lines.slice(0, 15)) {
    for (const m of line.matchAll(PHONE_RE)) {
      const digits = m[0].replace(/\D/g, '')
      if (digits.length >= 9 && digits.length <= 15 && !parseDateRange(m[0])) {
        phone = m[0].trim()
        break
      }
    }
    if (phone) break
  }
  let location: string | undefined
  for (const line of lines.slice(0, 8)) {
    for (const seg of line.split(/\s*[|•·]\s*/)) {
      const s = seg.trim()
      if (LOCATION_RE.test(s) && !EMAIL_RE.test(s)) {
        location = s
        break
      }
    }
    if (location) break
  }
  return { email, phone, linkedin, location }
}

interface ExperienceParse {
  roles: ScorableRole[]
  bullets: { roleIndex?: number; text: string }[]
}

function parseExperience(lines: string[]): ExperienceParse {
  const roles: ScorableRole[] = []
  const bullets: ExperienceParse['bullets'] = []
  let pending: string[] = []
  let current: ScorableRole | null = null
  let currentHasBullets = false

  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (BULLET_RE.test(t)) {
      const text = t.replace(BULLET_RE, '').trim()
      if (!text) continue
      if (current) {
        current.bullets.push(text)
        currentHasBullets = true
      }
      bullets.push({ roleIndex: current ? roles.length - 1 : undefined, text })
      pending = []
      continue
    }
    const techLine = /^(?:tech|stack|tech stack|technologies|tools|environment)\s*:\s*(.+)$/i.exec(t)
    if (techLine && current) {
      current.tech = [...(current.tech ?? []), ...splitSkills([techLine[1]!])]
      continue
    }
    const range = parseDateRange(t)
    if (range) {
      const rest = t.replace(range.matched, ' ').replace(/[()]/g, ' ')
      const header = parseRoleHeader([...pending, rest])
      current = { ...header, start: range.start, end: range.end, bullets: [] }
      roles.push(current)
      currentHasBullets = false
      pending = []
      continue
    }
    // Paragraph-style achievement line inside a role (no bullet marker).
    if (current && wordCount(t) >= 8) {
      current.bullets.push(t)
      currentHasBullets = true
      bullets.push({ roleIndex: roles.length - 1, text: t })
      continue
    }
    // Header continuation (title/company on the line after the dates).
    if (current && !currentHasBullets && (!current.title || !current.company)) {
      const h = parseRoleHeader([t])
      if (!current.title) current.title = h.title
      else if (!current.company) current.company = h.title || h.company
      continue
    }
    pending.push(t)
    if (pending.length > 2) pending = pending.slice(-2)
  }
  return { roles, bullets }
}

function fromText(
  rawText: string,
  kind: CvSourceKind,
  opts: { fileType?: string; pageCount?: number },
): ScorableCv {
  const text = rawText.replace(/\r\n?/g, '\n').replace(/ /g, ' ')
  const lines = text.split('\n')
  const sections: ScorableCv['sections'] = [{ heading: 'Header', lines: [] }]
  const order: string[] = []
  const keys: (string | null)[] = [null]

  for (const line of lines) {
    const key = headingKey(line)
    if (key) {
      sections.push({ heading: line.trim().replace(/[:：]+$/, ''), lines: [] })
      keys.push(key)
      if (!order.includes(key)) order.push(key)
      continue
    }
    if (line.trim()) sections[sections.length - 1]!.lines.push(line.trimEnd())
  }

  const bullets: ScorableCv['bullets'] = []
  let roles: ScorableRole[] = []
  let skillsListed: string[] = []
  sections.forEach((sec, i) => {
    const key = keys[i]
    if (key === 'experience') {
      const parsed = parseExperience(sec.lines)
      const offset = roles.length
      roles = [...roles, ...parsed.roles]
      for (const b of parsed.bullets) {
        bullets.push({
          section: sec.heading,
          roleIndex: b.roleIndex === undefined ? undefined : b.roleIndex + offset,
          text: b.text,
        })
      }
      return
    }
    if (key === 'skills') {
      skillsListed = [...skillsListed, ...splitSkills(sec.lines)]
      return
    }
    for (const l of sec.lines) {
      if (BULLET_RE.test(l.trim())) {
        bullets.push({ section: sec.heading, text: l.trim().replace(BULLET_RE, '').trim() })
      }
    }
  })

  const contentSections = sections.filter((s, i) => i > 0 || s.lines.length > 0)
  return {
    plainText: text.trim(),
    sections: contentSections,
    bullets,
    roles,
    skillsListed,
    contact: detectContact(lines, text),
    meta: {
      sourceKind: kind,
      pageCountEstimate: opts.pageCount ?? estimatePages(text),
      columnsSuspected: detectColumns(lines),
      fileType: opts.fileType,
      structured: false,
      sectionOrder: order,
    },
  }
}

/** Entry point: any CV source → ScorableCv. */
export function cvToScorable(source: CvSourceInput): ScorableCv {
  switch (source.kind) {
    case 'master_cv':
    case 'tailored_cv':
      return fromStructured(source.cv, source.kind)
    case 'latex_cv':
      return fromText(latexToText(source.source), 'latex_cv', { fileType: 'tex' })
    case 'upload':
      return fromText(source.text, 'upload', {
        fileType: source.fileType,
        pageCount: source.pageCount,
      })
  }
}

export const _internal = { parseRoleHeader, splitSkills, detectContact, parseExperience, fromText }
