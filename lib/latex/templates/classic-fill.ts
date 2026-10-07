import type { MasterCV } from '@/lib/documents/types'
import {
  classicHeader,
  classicLink,
  displayUrl,
  highlights,
  oneColEntry,
  twoColEntry,
} from '../classic-layout'
import { escapeLatex as e } from '../escape'

/**
 * Master CV → the Classic gallery template (cv-classic.tex). Same layout as
 * the Classic résumé variant (lib/variants/latex-classic.ts); every string
 * is escaped and links reach \href only when their URL is safe.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2021-04" → "Apr 2021"; "present" → "Present"; anything else as typed. */
function month(value: string | undefined): string {
  if (!value) return ''
  if (value.toLowerCase() === 'present') return 'Present'
  const m = /^(\d{4})-(\d{2})/.exec(value)
  const name = m ? MONTHS[Number(m[2]) - 1] : undefined
  return m && name ? `${name} ${m[1]}` : value
}

function range(start: string | undefined, end: string | undefined): string {
  return [month(start), month(end)].filter(Boolean).join(' – ')
}

/** A profile handle or URL → an https URL. */
function profileUrl(value: string, host: string, prefix: string): string {
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  if (v.toLowerCase().includes(host)) return `https://${v.replace(/^\/+/, '')}`
  return `https://${host}/${prefix}${v.replace(/^@/, '')}`
}

function header(cv: MasterCV): string {
  const b = cv.basics
  const facts = [
    b.phone ? classicLink(`tel:${b.phone.replace(/[^\d+]/g, '')}`, b.phone) : '',
    b.email ? classicLink(`mailto:${b.email}`, b.email) : '',
    b.location ? e(b.location) : '',
  ].filter(Boolean)
  const links = [
    b.linkedin ? profileUrl(b.linkedin, 'linkedin.com', 'in/') : '',
    b.github ? profileUrl(b.github, 'github.com', '') : '',
    b.website ? (/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`) : '',
  ]
    .filter(Boolean)
    .map((url) => classicLink(url, displayUrl(url)))
  return classicHeader({ name: e(b.name.toUpperCase()), title: e(b.headline), contactLines: [facts, links], photo: null })
}

function section(title: string, blocks: readonly string[], gap: string): string {
  if (blocks.length === 0) return ''
  return [`\\section{${e(title)}}`, blocks.join(`\n\n\\entrygap{${gap}}\n\n`)].join('\n\n')
}

function experience(cv: MasterCV): string {
  return section(
    'EXPERIENCE',
    cv.experience.map((x) => {
      const where = [x.company, x.location].filter(Boolean).map((v) => e(v!)).join(', ')
      const head = twoColEntry(`\\textbf{${e(x.role)}} \\\\\n    ${where}`, `\\textit{${e(range(x.start, x.end))}}`)
      const body = highlights(x.bullets.map(e))
      return body ? `${head}\n\n\\vspace{0.08 cm}\n\n${body}` : head
    }),
    '0.14 cm',
  )
}

function projects(cv: MasterCV): string {
  return section(
    'PROJECTS',
    (cv.projects ?? []).map((p) => {
      const name = p.description ? `${e(p.name)} -- ${e(p.description)}` : e(p.name)
      const head = twoColEntry(`\\textbf{${name}}`, p.tech?.length ? `\\textit{${e(p.tech.join(', '))}}` : '')
      const body = highlights((p.highlights ?? []).map(e))
      return body ? `${head}\n\n\\vspace{0.05 cm}\n\n${body}` : head
    }),
    '0.10 cm',
  )
}

function skills(cv: MasterCV): string {
  const rows: [string, string[] | undefined][] = [
    ['Primary', cv.skills.primary],
    ['Secondary', cv.skills.secondary],
  ]
  return section(
    'TECHNICAL SKILLS',
    rows.flatMap(([label, list]) => (list?.length ? [oneColEntry(`\\textbf{${label}:} ${e(list.join(', '))}`)] : [])),
    '0.05 cm',
  )
}

function education(cv: MasterCV): string {
  return section(
    'EDUCATION',
    (cv.education ?? []).map((ed) =>
      twoColEntry(`\\textbf{${e(ed.degree)}} \\\\\n    \\textit{${e(ed.school)}}`, e(range(ed.start, ed.end))),
    ),
    '0.05 cm',
  )
}

/** Fill cv-classic.tex: header, summary and the section blocks. */
export function fillClassic(templateSource: string, cv: MasterCV): string {
  const summary = cv.summary ? section('PROFESSIONAL SUMMARY', [oneColEntry(e(cv.summary))], '0.05 cm') : ''
  const sections = [summary, experience(cv), projects(cv), skills(cv), education(cv)].filter(Boolean).join('\n\n')
  return templateSource
    .split('{{name}}')
    .join(e(cv.basics.name))
    .split('{{header_block}}')
    .join(header(cv))
    .split('{{sections}}')
    .join(sections)
}
