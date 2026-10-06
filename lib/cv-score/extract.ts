/**
 * v12.0 — turn any CV source into a `ScorableCv`.
 *
 * - Structured sources (master / tailored CV JSON) are mapped directly — best
 *   fidelity, no parsing ambiguity.
 * - Text sources (uploads, LaTeX stripped to text) go through a heuristic
 *   segmenter (segment.ts): known section headings, bullet glyphs or wrapped
 *   paragraphs, date-range role headers with the company above or below,
 *   contact regexes + file hyperlinks, and a multi-column layout heuristic.
 *
 * v1.1 — every bullet, role and section records the source line indexes it
 * came from (`ScorableCv.lines`), so findings can cite exact lines.
 */
import type { MasterCV, TailoredCV } from '@/lib/documents/types'
import { latexToText } from './latex-text'
import { parseCvDate, parseDateRange } from './dates'
import { BULLET_RE, LOCATION_RE, parseBlocks, parseExperience, parseRoleHeader, type SegLine } from './segment'
import type { CvSourceKind, LineLayout, ScorableCv, ScorableRole } from './types'
import { wordCount } from './text'

export type CvSourceInput =
  | { kind: 'master_cv' | 'tailored_cv'; cv: MasterCV | TailoredCV }
  | { kind: 'latex_cv'; source: string }
  | {
      kind: 'upload'
      text: string
      fileType: string
      pageCount?: number
      /** v1.1 — hyperlink targets from the file (PDF annotations / DOCX links). */
      links?: string[]
      /** v1.1 — per-line PDF layout, aligned to `text.split('\n')`. */
      layout?: (LineLayout | null)[]
    }

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

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/?/i
const WEBSITE_RE = /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|dev|io|app|me|net|org|co|ai|site|xyz|in|ae|page|sh|codes)(?:\/[^\s|,]*)?/i
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g

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
  const headerIndexes = lines.map((_, i) => i).filter((i) => lines[i]?.trim())

  const sections: ScorableCv['sections'] = [{ heading: 'Header', lines: headerIndexes.map((i) => lines[i]!), lineIndexes: headerIndexes }]
  const bullets: ScorableCv['bullets'] = []
  const roles: ScorableRole[] = []
  const order: string[] = []

  /** Appends a section; returns the line index of its first body line. */
  const push = (key: string, heading: string, body: string[]): number => {
    if (body.length === 0) return -1
    const headingIndex = lines.length + 1
    const base = headingIndex + 1
    sections.push({ heading, lines: body, lineIndexes: body.map((_, j) => base + j), headingIndex })
    order.push(key)
    lines.push('', heading.toUpperCase(), ...body)
    return base
  }

  if (cv.summary?.trim()) push('summary', 'Summary', [cv.summary.trim()])

  const expLines: string[] = []
  const expBullets: { roleIndex: number; text: string; at: number }[] = []
  const roleAt: number[] = []
  cv.experience.forEach((e, roleIndex) => {
    const start = parseCvDate(e.start, false) ?? e.start
    const end = e.end === 'present' ? 'present' : (parseCvDate(e.end, true) ?? e.end)
    roleAt.push(expLines.length)
    expLines.push(`${e.role} — ${e.company} | ${e.start} – ${e.end}`)
    const rb = e.bullets.filter((x) => x.trim())
    for (const text of rb) {
      expBullets.push({ roleIndex, text, at: expLines.length })
      expLines.push(`• ${text}`)
    }
    const tech = (e.tech ?? []).filter((t) => t.trim())
    if (tech.length) expLines.push(`Tech: ${tech.join(', ')}`)
    roles.push({ company: e.company, title: e.role, start, end, bullets: rb, ...(tech.length ? { tech } : {}) })
  })
  const expBase = push('experience', 'Experience', expLines)
  for (const eb of expBullets) bullets.push({ section: 'Experience', roleIndex: eb.roleIndex, text: eb.text, lines: [expBase + eb.at] })
  roles.forEach((r, i) => {
    r.lines = [expBase + roleAt[i]!]
  })

  const projLines: string[] = []
  const projBullets: { text: string; at: number }[] = []
  for (const p of cv.projects ?? []) {
    projLines.push(p.name + (p.description ? ` — ${p.description}` : ''))
    for (const h of p.highlights ?? []) {
      projBullets.push({ text: h, at: projLines.length })
      projLines.push(`• ${h}`)
    }
  }
  const projBase = push('projects', 'Projects', projLines)
  for (const pb of projBullets) bullets.push({ section: 'Projects', text: pb.text, lines: [projBase + pb.at] })

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
    lines,
    sections: sections.filter((s, i) => i > 0 || s.lines.length > 0),
    bullets,
    roles,
    skillsListed,
    contact: {
      email: b.email,
      phone: b.phone,
      linkedin: b.linkedin,
      location: b.location,
      ...(b.github ? { github: b.github } : {}),
      ...(b.website ? { website: b.website } : {}),
    },
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

function normalizeUrl(u: string): string {
  return u.trim().replace(/[).,;]+$/, '')
}

/** Classify hyperlink targets into contact fields (mailto:, tel:, LinkedIn, GitHub, site). */
function contactFromLinks(links: readonly string[]): Partial<ScorableCv['contact']> {
  const out: Partial<ScorableCv['contact']> = {}
  for (const raw of links) {
    const u = normalizeUrl(raw)
    if (/^mailto:/i.test(u)) out.email ??= decodeURIComponent(u.replace(/^mailto:/i, '').split('?')[0] ?? '') || undefined
    else if (/^tel:/i.test(u)) out.phone ??= decodeURIComponent(u.replace(/^tel:/i, '')) || undefined
    else if (LINKEDIN_RE.test(u)) out.linkedin ??= u
    else if (GITHUB_RE.test(u)) out.github ??= u
    else if (/^https?:\/\//i.test(u)) out.website ??= u
  }
  return out
}

function detectContact(lines: string[], text: string, links: readonly string[] = []): ScorableCv['contact'] {
  const fromLinks = contactFromLinks(links)
  const email = EMAIL_RE.exec(text)?.[0] ?? fromLinks.email
  const linkedin = LINKEDIN_RE.exec(text)?.[0] ?? fromLinks.linkedin
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
  phone ??= fromLinks.phone
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
  const head = lines.slice(0, 8).join('\n')
  const github = GITHUB_RE.exec(head)?.[0] ?? fromLinks.github
  let website: string | undefined
  for (const line of lines.slice(0, 8)) {
    for (const seg of line.replace(EMAIL_RE, ' ').split(/\s*[|•·]\s*|\s{2,}/)) {
      const m = WEBSITE_RE.exec(seg.trim())
      if (m && !LINKEDIN_RE.test(m[0]) && !GITHUB_RE.test(m[0])) {
        website = m[0]
        break
      }
    }
    if (website) break
  }
  website ??= fromLinks.website
  return {
    email,
    phone,
    linkedin,
    location,
    ...(github ? { github } : {}),
    ...(website ? { website } : {}),
  }
}

interface TextOptions {
  fileType?: string
  pageCount?: number
  links?: readonly string[]
  layout?: readonly (LineLayout | null)[]
}

function fromText(rawText: string, kind: CvSourceKind, opts: TextOptions): ScorableCv {
  const text = rawText.replace(/\r\n?/g, '\n').replace(/ /g, ' ')
  const lines = text.split('\n')
  const sections: (ScorableCv['sections'][number] & { segLines: SegLine[] })[] = [
    { heading: 'Header', lines: [], lineIndexes: [], segLines: [] },
  ]
  const order: string[] = []
  const keys: (string | null)[] = [null]

  lines.forEach((line, index) => {
    const key = headingKey(line)
    if (key) {
      sections.push({ heading: line.trim().replace(/[:：]+$/, ''), lines: [], lineIndexes: [], headingIndex: index, segLines: [] })
      keys.push(key)
      if (!order.includes(key)) order.push(key)
      return
    }
    if (!line.trim()) return
    const sec = sections[sections.length - 1]!
    sec.lines.push(line.trimEnd())
    sec.lineIndexes!.push(index)
    sec.segLines.push({ text: line.trimEnd(), index, layout: opts.layout?.[index] ?? null })
  })

  const bullets: ScorableCv['bullets'] = []
  let roles: ScorableRole[] = []
  let skillsListed: string[] = []
  sections.forEach((sec, i) => {
    const key = keys[i]
    if (key === 'experience') {
      const parsed = parseExperience(sec.segLines)
      const offset = roles.length
      roles = [...roles, ...parsed.roles]
      for (const b of parsed.bullets) {
        bullets.push({
          section: sec.heading,
          roleIndex: b.roleIndex === undefined ? undefined : b.roleIndex + offset,
          text: b.text,
          lines: b.lines,
        })
      }
      return
    }
    if (key === 'skills') {
      skillsListed = [...skillsListed, ...splitSkills(sec.lines)]
      return
    }
    const parsed = parseBlocks(sec.segLines, { headers: key === 'projects' || key === 'volunteer' })
    for (const b of parsed.bullets) bullets.push({ section: sec.heading, text: b.text, lines: b.lines })
  })

  const contentSections = sections
    .map(({ segLines: _seg, ...rest }) => rest)
    .filter((s, i) => i > 0 || s.lines.length > 0)
  const links = [...new Set((opts.links ?? []).map(normalizeUrl).filter(Boolean))]
  return {
    plainText: text.trim(),
    lines,
    sections: contentSections,
    bullets,
    roles,
    skillsListed,
    contact: detectContact(lines, text, links),
    ...(links.length ? { links } : {}),
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
        links: source.links,
        layout: source.layout,
      })
  }
}

export const _internal = { parseRoleHeader, splitSkills, detectContact, parseExperience, fromText }
