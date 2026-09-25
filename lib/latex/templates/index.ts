import fs from 'node:fs'
import path from 'node:path'
import type { CoverLetter, MasterCV } from '@/lib/documents/types'

// Templates are shipped as .tex files next to this module. Read them at module
// init (server-only paths — this file is imported from server actions and the
// compile route which both run under `runtime='nodejs'`). Keeping them as .tex
// files means an editor's syntax highlighting works and the templates can be
// linted / opened in a LaTeX editor for maintenance.
const TEMPLATES_DIR = path.join(process.cwd(), 'lib', 'latex', 'templates')

function readTemplate(fileName: string): string {
  return fs.readFileSync(path.join(TEMPLATES_DIR, fileName), 'utf8')
}

// ---- CV template sources -----------------------------------------------------
const modernCVSource = readTemplate('moderncv-classic.tex')
const awesomeCVSource = readTemplate('awesome-cv.tex')
const altaCVSource = readTemplate('altacv-tw.tex')
const simpleCVSource = readTemplate('cv-simple.tex')
const europassCVSource = readTemplate('cv-europass-style.tex')
const academicCVSource = readTemplate('cv-academic-cv.tex')
const deedyCVSource = readTemplate('cv-deedy-resume.tex')
const jakeCVSource = readTemplate('cv-jake-gwinnett.tex')
const friggeriCVSource = readTemplate('cv-friggeri.tex')

// ---- Cover letter template sources ------------------------------------------
const letterClassicSource = readTemplate('letter-classic.tex')
const letterModerncvSource = readTemplate('letter-moderncv.tex')
const letterAwesomeSource = readTemplate('letter-awesome-cv.tex')
const letterModernProSource = readTemplate('letter-modern-professional.tex')
const letterFriendlySource = readTemplate('letter-friendly.tex')

export type LatexTemplateKind = 'cv' | 'cover_letter'
export type LatexTemplateCategory =
  | 'minimalist'
  | 'modern'
  | 'academic'
  | 'creative'
  | 'classic'

export interface LatexTemplate {
  id: string
  name: string
  description: string
  kind: LatexTemplateKind
  category: LatexTemplateCategory
  packages: string[]
  preview?: string
  source: string
  // For CV templates only. Cover-letter templates use `fillLetter`.
  fill?: (master: MasterCV) => string
  fillLetter?: (master: MasterCV | null, letter: CoverLetterFillInput) => string
}

// Loose shape used to fill a cover-letter template. All fields are optional so
// the picker can seed a "blank" letter without an application context.
export interface CoverLetterFillInput {
  senderName?: string
  senderContactLine?: string
  dateLine?: string
  recipientLine?: string
  greeting?: string
  paragraphs?: string[]
  closing?: string
}

/**
 * Escape a plain-text string so LaTeX renders it as literal text — no macros
 * or math triggered. We stash backslashes as a sentinel first, run the
 * per-char replacements (which use braces), then restore backslashes at the
 * end so the introduced braces aren't themselves escaped.
 */
const BS_SENTINEL = 'BS'
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
 * Sidebar-style skills list — one bullet per skill, used by altacv-tw and
 * deedy-resume.
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
// CV template fillers
// ---------------------------------------------------------------------------

/** Values shared by every generic (non-moderncv) CV template. */
function genericCvValues(master: MasterCV): Record<string, string> {
  return {
    name: escapeLatex(master.basics.name),
    headline: escapeLatex(master.basics.headline),
    contact_line: joinContact(master),
    summary: escapeLatex(master.summary || ''),
    experience_block: renderExperienceGeneric(master),
    projects_block: renderProjectsGeneric(master),
    education_block: renderEducationGeneric(master),
    skills_block: renderSkillsGeneric(master),
  }
}

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
  return replaceAll(awesomeCVSource, genericCvValues(master))
}

function fillAltaCV(master: MasterCV): string {
  return replaceAll(altaCVSource, {
    ...genericCvValues(master),
    skills_block: renderSkillsSidebar(master),
  })
}

function fillSimpleCV(master: MasterCV): string {
  return replaceAll(simpleCVSource, genericCvValues(master))
}

function fillEuropassCV(master: MasterCV): string {
  return replaceAll(europassCVSource, genericCvValues(master))
}

function fillAcademicCV(master: MasterCV): string {
  return replaceAll(academicCVSource, genericCvValues(master))
}

function fillDeedyCV(master: MasterCV): string {
  return replaceAll(deedyCVSource, {
    ...genericCvValues(master),
    skills_block: renderSkillsSidebar(master),
  })
}

function fillJakeCV(master: MasterCV): string {
  return replaceAll(jakeCVSource, genericCvValues(master))
}

function fillFriggeriCV(master: MasterCV): string {
  return replaceAll(friggeriCVSource, genericCvValues(master))
}

// ---------------------------------------------------------------------------
// Cover letter template fillers
// ---------------------------------------------------------------------------

/**
 * Build the placeholder values for a cover-letter template. If `master` is
 * provided, sender_name and sender_contact_line default from the master CV
 * basics; otherwise fall back to bracketed placeholders the user can fill in.
 */
function letterValues(
  master: MasterCV | null,
  letter: CoverLetterFillInput,
): Record<string, string> {
  const senderName =
    letter.senderName ??
    master?.basics.name ??
    '[Your Name]'
  const contactPieces = master
    ? [master.basics.email, master.basics.phone, master.basics.location].filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      )
    : []
  const senderContactLine =
    letter.senderContactLine ??
    (contactPieces.length ? contactPieces.map(escapeLatex).join('  ·  ') : '[email  ·  phone  ·  location]')

  const paragraphs = letter.paragraphs && letter.paragraphs.length
    ? letter.paragraphs
    : [
        'I am writing to express my interest in the [Position] role at [Company]. Given my background, I believe I can make an immediate contribution to your team.',
        'Throughout my career I have delivered [key accomplishment]. I am particularly drawn to [Company] because [reason].',
        'I would welcome the opportunity to discuss how my experience aligns with your needs. Thank you for your consideration.',
      ]
  const bodyParagraphs = paragraphs
    .map((p) => escapeLatex(p))
    .join('\n\n')

  return {
    sender_name: escapeLatex(senderName),
    sender_contact_line: senderContactLine,
    date_line: escapeLatex(letter.dateLine ?? '[Date]'),
    recipient_line: escapeLatex(letter.recipientLine ?? '[Hiring Manager]\n[Company Name]'),
    greeting: escapeLatex(letter.greeting ?? 'Dear Hiring Manager,'),
    body_paragraphs: bodyParagraphs,
    closing: escapeLatex(letter.closing ?? 'Sincerely,'),
  }
}

function makeLetterFiller(source: string) {
  return (master: MasterCV | null, letter: CoverLetterFillInput): string =>
    replaceAll(source, letterValues(master, letter))
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

export const TEMPLATES: LatexTemplate[] = [
  // ---- CV templates ----
  {
    id: 'moderncv-classic',
    name: 'ModernCV Classic',
    description:
      'Classic academic layout using the moderncv package. Blue accents, single column.',
    kind: 'cv',
    category: 'classic',
    packages: ['moderncv', 'geometry'],
    source: modernCVSource,
    fill: fillModernCV,
  },
  {
    id: 'awesome-cv',
    name: 'Awesome CV',
    description:
      'Popular GitHub-style layout with color accents and clean section headers.',
    kind: 'cv',
    category: 'modern',
    packages: ['hyperref', 'xcolor', 'titlesec', 'enumitem', 'fontawesome5', 'lmodern'],
    source: awesomeCVSource,
    fill: fillAwesomeCV,
  },
  {
    id: 'altacv-tw',
    name: 'AltaCV (two column)',
    description: 'Two-column layout with a sidebar for skills and education.',
    kind: 'cv',
    category: 'modern',
    packages: ['paracol', 'xcolor', 'titlesec', 'enumitem', 'lmodern'],
    source: altaCVSource,
    fill: fillAltaCV,
  },
  {
    id: 'cv-simple',
    name: 'Simple ATS',
    description:
      'Clean minimalist single-column, ideal for ATS submissions. No fancy packages.',
    kind: 'cv',
    category: 'minimalist',
    packages: ['geometry', 'hyperref'],
    source: simpleCVSource,
    fill: fillSimpleCV,
  },
  {
    id: 'cv-europass-style',
    name: 'Europass Style',
    description:
      'European-style CV with structured sections and a two-column header for photo-optional layout.',
    kind: 'cv',
    category: 'classic',
    packages: ['paracol', 'xcolor', 'titlesec', 'enumitem', 'lmodern'],
    source: europassCVSource,
    fill: fillEuropassCV,
  },
  {
    id: 'cv-academic-cv',
    name: 'Academic CV',
    description:
      'Long-form academic CV with sections for Publications, Grants, Teaching, and Talks.',
    kind: 'cv',
    category: 'academic',
    packages: ['hyperref', 'titlesec', 'enumitem', 'lmodern'],
    source: academicCVSource,
    fill: fillAcademicCV,
  },
  {
    id: 'cv-deedy-resume',
    name: 'Deedy Resume',
    description:
      'Deedy-inspired two-column resume — sidebar for skills/education, main column for experience.',
    kind: 'cv',
    category: 'modern',
    packages: ['paracol', 'xcolor', 'titlesec', 'enumitem', 'lmodern'],
    source: deedyCVSource,
    fill: fillDeedyCV,
  },
  {
    id: 'cv-jake-gwinnett',
    name: 'Jake Gwinnett',
    description:
      'Dense single-page resume, popular in tech. Compact spacing, no color.',
    kind: 'cv',
    category: 'minimalist',
    packages: ['titlesec', 'enumitem', 'lmodern'],
    source: jakeCVSource,
    fill: fillJakeCV,
  },
  {
    id: 'cv-friggeri',
    name: 'Friggeri Modern',
    description:
      'Modern layout with a colored accent stripe drawn via TikZ. Bold header.',
    kind: 'cv',
    category: 'creative',
    packages: ['xcolor', 'titlesec', 'enumitem', 'tikz', 'lmodern'],
    source: friggeriCVSource,
    fill: fillFriggeriCV,
  },

  // ---- Cover letter templates ----
  {
    id: 'letter-classic',
    name: 'Classic Business Letter',
    description:
      'Traditional business letter — sender block top-right, recipient block, date, greeting, body.',
    kind: 'cover_letter',
    category: 'classic',
    packages: ['geometry', 'hyperref', 'lmodern'],
    source: letterClassicSource,
    fillLetter: makeLetterFiller(letterClassicSource),
  },
  {
    id: 'letter-moderncv',
    name: 'ModernCV Letter',
    description:
      'Matches the ModernCV Classic CV template — pair them for a consistent look.',
    kind: 'cover_letter',
    category: 'classic',
    packages: ['moderncv', 'geometry'],
    source: letterModerncvSource,
    fillLetter: makeLetterFiller(letterModerncvSource),
  },
  {
    id: 'letter-awesome-cv',
    name: 'Awesome CV Letter',
    description:
      'Matches the Awesome CV template — blue accent letterhead with hairline separator.',
    kind: 'cover_letter',
    category: 'modern',
    packages: ['hyperref', 'xcolor', 'titlesec', 'lmodern'],
    source: letterAwesomeSource,
    fillLetter: makeLetterFiller(letterAwesomeSource),
  },
  {
    id: 'letter-modern-professional',
    name: 'Modern Professional',
    description:
      'Clean modern letterhead with a colored bar under the sender block. Corporate-friendly.',
    kind: 'cover_letter',
    category: 'modern',
    packages: ['hyperref', 'xcolor', 'lmodern'],
    source: letterModernProSource,
    fillLetter: makeLetterFiller(letterModernProSource),
  },
  {
    id: 'letter-friendly',
    name: 'Friendly Letter',
    description:
      'Warmer, conversational tone with less rigid formatting. Great for startups.',
    kind: 'cover_letter',
    category: 'creative',
    packages: ['geometry', 'hyperref', 'lmodern'],
    source: letterFriendlySource,
    fillLetter: makeLetterFiller(letterFriendlySource),
  },
]

export function getTemplate(id: string): LatexTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}

/**
 * Fill a template with the given master CV (and optional CoverLetter). For a
 * `cv` template a MasterCV is required; for a `cover_letter` template a
 * CoverLetter-like input is required (senderName defaults from the master CV
 * basics when both are supplied).
 *
 * Throws for unknown templateId, missing master CV on a `cv` template, or
 * missing letter on a `cover_letter` template.
 */
export function fillTemplate(
  templateId: string,
  master: MasterCV | null,
  letter?: CoverLetterFillInput,
): string {
  const template = getTemplate(templateId)
  if (!template) {
    throw new Error(`Unknown LaTeX template id: ${templateId}`)
  }
  if (template.kind === 'cv') {
    if (!master) throw new Error(`Template ${templateId} requires a master CV.`)
    if (!template.fill) throw new Error(`Template ${templateId} is missing a fill function.`)
    return template.fill(master)
  }
  // cover_letter
  if (!template.fillLetter) {
    throw new Error(`Template ${templateId} is missing a fillLetter function.`)
  }
  return template.fillLetter(master, letter ?? {})
}

/**
 * Convenience wrapper for cover-letter templates — mirrors the CoverLetter
 * schema in lib/documents/types so callers can pass a persisted CoverLetter
 * directly without a manual shape conversion.
 */
export function fillCoverLetterTemplate(
  templateId: string,
  master: MasterCV | null,
  letter: CoverLetter | CoverLetterFillInput,
): string {
  const input: CoverLetterFillInput =
    'paragraphs' in letter && Array.isArray(letter.paragraphs)
      ? {
          senderName: 'senderName' in letter ? letter.senderName : undefined,
          greeting: 'greeting' in letter ? letter.greeting : undefined,
          paragraphs: letter.paragraphs,
          closing: 'closing' in letter ? letter.closing : undefined,
        }
      : (letter as CoverLetterFillInput)
  return fillTemplate(templateId, master, input)
}
