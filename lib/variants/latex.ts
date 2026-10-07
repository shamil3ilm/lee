import { BRAND_COLORS } from '@/lib/brand'
import { escapeLatex } from '@/lib/latex/templates'
import type { RenderedEntry, RenderedResume, RenderedSection } from './render'
import { classicVariantToLatex } from './latex-classic'

/**
 * Rendered variant → LaTeX for the existing pipeline (latexonline.cc via
 * lib/latex). Three templates, all standard packages only:
 *   ats      single column, no colour, no tables/icons — parses cleanly
 *   brand    same structure with the lee brand tokens (lib/brand.ts)
 *   classic  RenderCV-style Charter layout (./latex-classic.ts)
 * Every user string goes through escapeLatex. With a photo (the variant's
 * Photo toggle on, its region allowing it, and a profile photo uploaded),
 * both templates place it beside the name block: plain in `ats`, framed in
 * the brand colour in `brand`. The file name is lee's own (lib/resume/photo.ts),
 * never user input; the image itself travels in the compile tarball.
 */

const e = escapeLatex

function hex(color: string): string {
  return color.replace('#', '').toUpperCase()
}

const PHOTO_NAME = /^lee-photo\.(jpg|png)$/

function preamble(r: RenderedResume, compact: boolean, photo: boolean): string {
  const margin = compact ? '0.6in' : '0.75in'
  const brand = r.template === 'brand'
  return [
    `\\documentclass[${compact ? '10pt' : '11pt'},a4paper]{article}`,
    `\\usepackage[margin=${margin}]{geometry}`,
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage{lmodern}',
    '\\usepackage{textcomp}',
    '\\usepackage[hidelinks]{hyperref}',
    '\\usepackage{enumitem}',
    photo ? '\\usepackage{graphicx}' : '',
    brand ? '\\usepackage[table]{xcolor}' : '',
    brand ? `\\definecolor{leetile}{HTML}{${hex(BRAND_COLORS.tile)}}` : '',
    brand ? `\\definecolor{leeglyph}{HTML}{${hex(BRAND_COLORS.glyph)}}` : '',
    '\\pagestyle{empty}',
    '\\setlength{\\parindent}{0pt}',
    '\\setlist[itemize]{leftmargin=1.2em,itemsep=1pt,topsep=2pt,parsep=0pt}',
    brand
      ? '\\newcommand{\\cvsection}[1]{\\vspace{7pt}{\\color{leetile}\\large\\bfseries #1}\\\\[-7pt]{\\color{leeglyph}\\rule{\\linewidth}{1.2pt}}\\vspace{1pt}}'
      : '\\newcommand{\\cvsection}[1]{\\vspace{6pt}{\\bfseries\\MakeUppercase{#1}}\\\\[-7pt]\\rule{\\linewidth}{0.4pt}\\vspace{1pt}}',
  ]
    .filter(Boolean)
    .join('\n')
}

function nameBlock(r: RenderedResume, align: 'center' | 'left'): string[] {
  const brand = r.template === 'brand'
  const contact = r.contact.map((c) => e(c.field === 'profile' || c.field === 'url' || c.field === 'email' ? c.value : `${c.label}: ${c.value}`))
  const name = brand ? `{\\color{leetile}\\Huge\\bfseries ${e(r.name)}}` : `{\\LARGE\\bfseries ${e(r.name)}}`
  // Beside a photo the contact line is narrower: allow breaks between items.
  const sep = align === 'center' ? ' \\textperiodcentered{} ' : ' \\textperiodcentered{} \\allowbreak '
  return [`${name}\\\\[3pt]`, `{\\large ${e(r.headline)}}\\\\[3pt]`, `{\\small ${contact.join(sep)}}`]
}

function photoBox(r: RenderedResume, photo: string): string {
  const image = `\\includegraphics[width=2.6cm,height=2.6cm,keepaspectratio]{${photo}}`
  if (r.template !== 'brand') return image
  return `{\\setlength{\\fboxsep}{0pt}\\setlength{\\fboxrule}{1.2pt}\\fcolorbox{leeglyph}{white}{${image}}}`
}

function header(r: RenderedResume, photo: string | null): string {
  if (!photo) return ['\\begin{center}', ...nameBlock(r, 'center').map((l) => `  ${l}`), '\\end{center}'].join('\n')
  return [
    '\\noindent',
    '\\begin{minipage}[c]{0.76\\linewidth}',
    '  \\raggedright',
    ...nameBlock(r, 'left').map((l) => `  ${l}`),
    '\\end{minipage}\\hfill',
    '\\begin{minipage}[c]{0.2\\linewidth}',
    '  \\raggedleft',
    `  ${photoBox(r, photo)}`,
    '\\end{minipage}',
    '\\par\\vspace{4pt}',
  ].join('\n')
}

function entry(x: RenderedEntry): string {
  const right = [x.location, x.dates].filter(Boolean).map(e).join(' \\textperiodcentered{} ')
  const head = `\\textbf{${e(x.title)}}${x.subtitle ? ` --- ${e(x.subtitle)}` : ''}${right ? ` \\hfill {\\small ${right}}` : ''}`
  const stack = x.keywords.length > 0 ? `\\\\{\\small\\textit{${e(x.keywords.join(', '))}}}` : ''
  const bullets = x.bullets.length > 0 ? `\n\\begin{itemize}\n${x.bullets.map((b) => `  \\item ${e(b.text)}`).join('\n')}\n\\end{itemize}` : ''
  return `${head}${stack}${bullets}`
}

function section(s: RenderedSection): string {
  const body = [
    ...s.lines.map((l) => `${e(l)}\\par`),
    ...s.entries.map(entry),
  ].join('\n\\vspace{3pt}\n')
  return `\\cvsection{${e(s.label)}}\n${body}`
}

/**
 * `photo` is the asset file name (lee-photo.jpg / .png) to place, or null.
 * Anything else is ignored rather than embedded in the source.
 */
export function variantToLatex(r: RenderedResume, lengthTarget: 1 | 2, photo: string | null = null): string {
  const placed = photo && PHOTO_NAME.test(photo) ? photo : null
  if (r.template === 'classic') return classicVariantToLatex(r, placed)
  return [
    `%% Generated by lee from a résumé variant — edit the variant, not this file.`,
    preamble(r, lengthTarget === 1, placed !== null),
    '\\begin{document}',
    header(r, placed),
    ...r.sections.map(section),
    '\\end{document}',
    '',
  ].join('\n')
}
