import fs from 'node:fs'
import path from 'node:path'
import type { MasterCV } from '@/lib/documents/types'

// Templates are shipped as .tex files next to this module. Read them at module
// init (server-only paths — this file is imported from server actions and the
// compile route which both run under `runtime='nodejs'`). Keeping them as .tex
// files means an editor's syntax highlighting works and the templates can be
// linted / opened in a LaTeX editor for maintenance.
const TEMPLATES_DIR = path.join(process.cwd(), 'lib', 'latex', 'templates')

function readTemplate(fileName: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, fileName), 'utf8')
}

const modernCVSource = readTemplate('moderncv-classic.tex')
const awesomeCVSource = readTemplate('awesome-cv.tex')
const altaCVSource = readTemplate('altacv-tw.tex')

export interface LatexTemplate {
  id: string
  name: string
  description: string
  source: string
  fill: (master: MasterCV) => string
}

/**
 * Escape a plain-text string so LaTeX renders it as literal text — no macros
 * or math triggered. We stash backslashes as a sentinel first, run the
 * per-char replacements (which use braces), then restore backslashes at the
 * end so the introduced braces aren't themselves escaped.
 */
const BS_SENTINEL = 'BS'
export function escapeLatex(input: string): string {
  return input
    .replace(/\\/g, BS_SENTINEL)
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/</g, '\\textless{}')
    .replace(/>/g, '\\textgreater{}')
    .split(BS_SENTINEL)
    .join('\\textbackslash{}')
}

/**
 * Split a full name into first/last for templates (like ModernCV) that want
 * them as separate macros. If the name is a single token, last is empty.
 */
export function splitName(full: string): { first: string; last: string } {
  const trimmed = full.trim()
  if (!trimmed) return { first: '', last: '' }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { first: parts[0]!, last: '' }
  return {
    first: parts.slice(0, -1).join(' '),
    last: parts[parts.length - 1]!,
  }
}

function joinContact(cv: MasterCV): string {
  const b = cv.basics
  const pieces = [b.email, b.phone, b.location, b.linkedin, b.github, b.website].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  )
  return pieces.map(escapeLatex).join('  ·  ')
}

/**
 * ModernCV-style contact block. Uses \email, \phone, \social macros which
 * are all defined in the moderncv class.
 */
function moderncvContactBlock(cv: MasterCV): string {
  const b = cv.basics
  const out: string[] = []
  if (b.location) out.push(`\\address{${escapeLatex(b.location)}}{}{}`)
  if (b.phone) out.push(`\\phone[mobile]{${escapeLatex(b.phone)}}`)
  if (b.email) out.push(`\\email{${escapeLatex(b.email)}}`)
  if (b.linkedin) out.push(`\\social[linkedin]{${escapeLatex(b.linkedin)}}`)
  if (b.github) out.push(`\\social[github]{${escapeLatex(b.github)}}`)
  if (b.website) out.push(`\\homepage{${escapeLatex(b.website)}}`)
  return out.join('\n')
}

function renderExperienceModernCV(cv: MasterCV): string {
  return cv.experience
    .map((e) => {
      const years = `${e.start} -- ${e.end === 'present' ? 'present' : e.end}`
      const bullets = e.bullets
        .map((b) => `  \\item ${escapeLatex(b)}`)
        .join('\n')
      const items = bullets ? `\n\\begin{itemize}\n${bullets}\n\\end{itemize}` : ''
      // \cventry{years}{degree/job title}{institution/company}{city}{}{description}
      return `\\cventry{${escapeLatex(years)}}{${escapeLatex(e.role)}}{${escapeLatex(
        e.company,
      )}}{${escapeLatex(e.location ?? '')}}{}{${items}}`
    })
    .join('\n\n')
}

function renderExperienceGeneric(cv: MasterCV): string {
  return cv.experience
    .map((e) => {
      const years = `${e.start} -- ${e.end === 'present' ? 'present' : e.end}`
      const bullets = e.bullets
        .map((b) => `  \\item ${escapeLatex(b)}`)
        .join('\n')
      const items = bullets ? `\\begin{itemize}\n${bullets}\n\\end{itemize}` : ''
      return `\\entry{${escapeLatex(e.role)}}{${escapeLatex(e.company)}}{${escapeLatex(
        e.location ?? '',
      )}}{${escapeLatex(years)}}\n${items}`
    })
    .join('\n\n\\vspace{4pt}\n')
}

function renderProjectsModernCV(cv: MasterCV): string {
  const list = cv.projects ?? []
  if (!list.length) return '\\cvitem{}{No projects listed.}'
  return list
    .map((p) => {
      const tech = p.tech && p.tech.length ? ` (${escapeLatex(p.tech.join(', '))})` : ''
      const desc = escapeLatex(p.description ?? '')
      return `\\cvitem{${escapeLatex(p.name)}}{${desc}${tech}}`
    })
    .join('\n')
}

function renderProjectsGeneric(cv: MasterCV): string {
  const list = cv.projects ?? []
  if (!list.length) return 'No projects listed.'
  return list
    .map((p) => {
      const tech = p.tech && p.tech.length ? ` \\textit{(${escapeLatex(p.tech.join(', '))})}` : ''
      const desc = escapeLatex(p.description ?? '')
      return `\\textbf{${escapeLatex(p.name)}} --- ${desc}${tech}`
    })
    .join('\\\\[3pt]\n')
}

function renderEducationModernCV(cv: MasterCV): string {
  const list = cv.education ?? []
  if (!list.length) return ''
  return list
    .map((ed) => {
      const years = `${ed.start ?? ''}${ed.end ? ` -- ${ed.end}` : ''}`
      return `\\cventry{${escapeLatex(years)}}{${escapeLatex(ed.degree)}}{${escapeLatex(
        ed.school,
      )}}{${escapeLatex(ed.location ?? '')}}{}{${escapeLatex(ed.honors ?? '')}}`
    })
    .join('\n')
}

function renderEducationGeneric(cv: MasterCV): string {
  const list = cv.education ?? []
  if (!list.length) return 'No education listed.'
  return list
    .map((ed) => {
      const years = `${ed.start ?? ''}${ed.end ? ` -- ${ed.end}` : ''}`
      return `\\textbf{${escapeLatex(ed.degree)}}, ${escapeLatex(ed.school)}${
        years ? ` \\textit{(${escapeLatex(years)})}` : ''
      }`
    })
    .join('\\\\[2pt]\n')
}

function renderSkillsModernCV(cv: MasterCV): string {
  const out: string[] = []
  if (cv.skills.primary.length) {
    out.push(`\\cvitem{Primary}{${escapeLatex(cv.skills.primary.join(', '))}}`)
  }
  if (cv.skills.secondary && cv.skills.secondary.length) {
    out.push(`\\cvitem{Secondary}{${escapeLatex(cv.skills.secondary.join(', '))}}`)
  }
  return out.join('\n')
}

function renderSkillsGeneric(cv: MasterCV): string {
  const lines: string[] = []
  if (cv.skills.primary.length) {
    lines.push(`\\textbf{Primary:} ${escapeLatex(cv.skills.primary.join(', '))}`)
  }
  if (cv.skills.secondary && cv.skills.secondary.length) {
    lines.push(`\\textbf{Secondary:} ${escapeLatex(cv.skills.secondary.join(', '))}`)
  }
  return lines.join('\\\\[2pt]\n')
}

/**
 * Sidebar-style skills list — one bullet per skill, used by altacv-tw.
 */
function renderSkillsSidebar(cv: MasterCV): string {
  const all = [
    ...cv.skills.primary,
    ...(cv.skills.secondary ?? []),
  ]
  if (!all.length) return 'No skills listed.'
  const items = all.map((s) => `  \\item ${escapeLatex(s)}`).join('\n')
  return `\\begin{itemize}\n${items}\n\\end{itemize}`
}

function replaceAll(source: string, values: Record<string, string>): string {
  let out = source
  for (const [k, v] of Object.entries(values)) {
    out = out.split(`{{${k}}}`).join(v)
  }
  return out
}

// ---------------------------------------------------------------------------
// Per-template fill functions.
// ---------------------------------------------------------------------------

function fillModernCV(master: MasterCV): string {
  const { first, last } = splitName(master.basics.name)
  return replaceAll(modernCVSource, {
    first_name: escapeLatex(first),
    last_name: escapeLatex(last),
    name: escapeLatex(master.basics.name),
    headline: escapeLatex(master.basics.headline),
    contact_line: moderncvContactBlock(master),
    summary: escapeLatex(master.summary || ''),
    experience_block: renderExperienceModernCV(master),
    projects_block: renderProjectsModernCV(master),
    education_block: renderEducationModernCV(master),
    skills_block: renderSkillsModernCV(master),
  })
}

function fillAwesomeCV(master: MasterCV): string {
  return replaceAll(awesomeCVSource, {
    name: escapeLatex(master.basics.name),
    headline: escapeLatex(master.basics.headline),
    contact_line: joinContact(master),
    summary: escapeLatex(master.summary || ''),
    experience_block: renderExperienceGeneric(master),
    projects_block: renderProjectsGeneric(master),
    education_block: renderEducationGeneric(master),
    skills_block: renderSkillsGeneric(master),
  })
}

function fillAltaCV(master: MasterCV): string {
  return replaceAll(altaCVSource, {
    name: escapeLatex(master.basics.name),
    headline: escapeLatex(master.basics.headline),
    contact_line: joinContact(master),
    summary: escapeLatex(master.summary || ''),
    experience_block: renderExperienceGeneric(master),
    projects_block: renderProjectsGeneric(master),
    education_block: renderEducationGeneric(master),
    skills_block: renderSkillsSidebar(master),
  })
}

export const TEMPLATES: LatexTemplate[] = [
  {
    id: 'moderncv-classic',
    name: 'ModernCV Classic',
    description:
      'Classic academic layout using the moderncv package. Blue accents, single column.',
    source: modernCVSource,
    fill: fillModernCV,
  },
  {
    id: 'awesome-cv',
    name: 'Awesome CV',
    description:
      'Popular GitHub-style layout with color accents and clean section headers.',
    source: awesomeCVSource,
    fill: fillAwesomeCV,
  },
  {
    id: 'altacv-tw',
    name: 'AltaCV (two column)',
    description: 'Two-column layout with a sidebar for skills and education.',
    source: altaCVSource,
    fill: fillAltaCV,
  },
]

export function getTemplate(id: string): LatexTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}

/**
 * Fill a template with the given master CV. Throws if the templateId isn't
 * registered — callers should validate first if they want soft-failure.
 */
export function fillTemplate(templateId: string, master: MasterCV): string {
  const template = getTemplate(templateId)
  if (!template) {
    throw new Error(`Unknown LaTeX template id: ${templateId}`)
  }
  return template.fill(master)
}
