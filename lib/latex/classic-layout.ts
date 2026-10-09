import { escapeLatex } from './escape'

/**
 * The "Classic" résumé layout (RenderCV-style): article 10pt on A4 (US
 * Letter for a US variant, via classicPreamble) with 2 cm margins,
 * Charter, titlesec section headings over a full-width rule, `onecolentry` / `twocolentry` (right-aligned italic dates
 * via paracol) / `highlights` (tight itemize), the name in large caps at the
 * top left with a bold title line and contact lines below, and an optional
 * photo at the top right. Standard packages only: every one of them is on
 * latexonline.cc (see docs/latex-compile.md), so no fallback is needed.
 *
 * Shared by the résumé-variant renderer (lib/variants/latex-classic.ts) and
 * the editor gallery template (templates/cv-classic.tex, whose preamble a
 * unit test keeps identical to CLASSIC_PREAMBLE).
 */

export const CLASSIC_PREAMBLE = String.raw`\documentclass[10pt, a4paper]{article}

% Packages:
\usepackage[
    ignoreheadfoot,
    top=2 cm,
    bottom=2 cm,
    left=2 cm,
    right=2 cm,
    footskip=1.0 cm
]{geometry}

\usepackage{ragged2e}
\usepackage{titlesec}
\usepackage[dvipsnames]{xcolor}
\definecolor{primaryColor}{RGB}{0, 0, 0}
\usepackage{enumitem}
\usepackage[
    pdfcreator={LaTeX},
    colorlinks=true,
    urlcolor=primaryColor,
    linkcolor=primaryColor
]{hyperref}
\usepackage{calc}
\usepackage{bookmark}
\usepackage{changepage}
\usepackage{paracol}
\usepackage{needspace}
\usepackage{iftex}
\usepackage{etoolbox}

\ifPDFTeX
    \input{glyphtounicode}
    \pdfgentounicode=1
    \usepackage[T1]{fontenc}
    \usepackage[utf8]{inputenc}
    \usepackage{lmodern}
\fi

\usepackage{charter}
\usepackage{textcomp}
\usepackage{graphicx}

% Settings
\raggedright
\AtBeginEnvironment{adjustwidth}{\partopsep0pt}
\pagestyle{empty}
\setcounter{secnumdepth}{0}
\setlength{\parindent}{0pt}
\setlength{\topskip}{0pt}
\setlength{\columnsep}{0.15cm}
\pagenumbering{gobble}

% Prevent awkward word splitting
\hyphenpenalty=10000
\exhyphenpenalty=10000
\tolerance=1000

\titleformat{\section}
    {\needspace{4\baselineskip}\bfseries\large}
    {}
    {0pt}
    {}
    [\vspace{1pt}\titlerule]

\titlespacing{\section}{-1pt}{0.3 cm}{0.2 cm}

\renewcommand\labelitemi{$\vcenter{\hbox{\small$\bullet$}}$}

% Space between entries. The LaTeX of 2017 (latexonline.cc) drops a \vspace
% right before paracol; an empty box of the same size keeps the spacing of
% current TeX Live (Overleaf, YtoTech).
\makeatletter
\@ifl@t@r\fmtversion{2020/10/01}
    {\newcommand{\entrygap}[1]{\vspace{#1}}}
    {\newcommand{\entrygap}[1]{\par\ifdim\prevdepth>\z@\dimen@=\prevdepth\else\dimen@=\z@\fi\nointerlineskip\vbox to \dimexpr #1+\dimen@\relax{}}}
\makeatother

\newenvironment{highlights}{
    \begin{itemize}[
        topsep=0.10 cm,
        parsep=0.10 cm,
        partopsep=0pt,
        itemsep=0pt,
        leftmargin=0 cm + 10pt
    ]
}{
    \end{itemize}
}

\newenvironment{onecolentry}{
    \begin{adjustwidth}{0 cm + 0.00001 cm}{0 cm + 0.00001 cm}
}{
    \end{adjustwidth}
}

\newenvironment{twocolentry}[2][]{
    \onecolentry
    \def\secondColumn{#2}
    \setcolumnwidth{\fill, 4.5 cm}
    \begin{paracol}{2}
    \raggedright
}{
    \switchcolumn
    \raggedleft
    \secondColumn
    \end{paracol}
    \endonecolentry
}`

/** The Classic preamble on the given paper (A4 is the default). */
export function classicPreamble(paper: 'a4' | 'letter'): string {
  return paper === 'a4' ? CLASSIC_PREAMBLE : CLASSIC_PREAMBLE.replace('[10pt, a4paper]', '[10pt, letterpaper]')
}

/** Contact separator; the space after the bar is where a long line wraps. */
export const CLASSIC_SEPARATOR = String.raw`\kern 5pt | \kern 5pt `

/** Characters a URL may contain and still be passed to \href safely. */
const SAFE_URL = /^(?:https?:\/\/|mailto:|tel:)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/

/**
 * A URL as the first argument of \href, or null when it can't be passed
 * safely (no scheme lee knows, spaces, braces, backslashes …). `%` and `#`
 * are escaped as hyperref expects.
 */
export function hrefUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!SAFE_URL.test(trimmed)) return null
  return trimmed.replace(/[%#]/g, (c) => `\\${c}`)
}

/** "https://www.example.com/me/" → "example.com/me" (shown text). */
export function displayUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')
}

/** \href{url}{text} with `text` escaped; plain escaped text when the URL is unsafe. */
export function classicLink(url: string, text: string): string {
  const href = hrefUrl(url)
  return href ? `\\href{${href}}{${escapeLatex(text)}}` : escapeLatex(text)
}

export interface ClassicHeader {
  /** Already-escaped LaTeX for each part. */
  name: string
  title: string
  /** Each inner array is one contact line of already-rendered items. */
  contactLines: readonly (readonly string[])[]
  /** Photo file name to place at the top right, or null (header reflows to full width). */
  photo: string | null
}

export function classicHeader(h: ClassicHeader): string {
  const width = h.photo ? '0.78\\textwidth' : '\\textwidth'
  const lines = h.contactLines.filter((l) => l.length > 0).map((l) => `        ${l.join(` ${CLASSIC_SEPARATOR}`)}`)
  const out = [
    '\\begingroup',
    '    \\noindent',
    `    \\begin{minipage}[c]{${width}}`,
    '        \\raggedright',
    '',
    `        {\\fontsize{22pt}{22pt}\\bfseries ${h.name}}`,
    '',
    '        \\vspace{6pt}',
    '',
  ]
  if (h.title) out.push(`        {\\fontsize{12pt}{12pt}\\bfseries ${h.title}}`, '', '        \\vspace{4pt}', '')
  out.push('        \\normalsize', lines.join('\n\n'), '    \\end{minipage}')
  if (h.photo) {
    out.push(
      '    \\hfill',
      '    \\begin{minipage}[c]{0.18\\textwidth}',
      '        \\raggedleft',
      `        \\includegraphics[width=2.5cm,height=2.5cm,keepaspectratio]{${h.photo}}`,
      '    \\end{minipage}',
    )
  }
  out.push('\\endgroup', '', '\\vspace{5pt}')
  return out.join('\n')
}

/** A two-column entry: `left` (LaTeX) with `right` right-aligned beside it. */
export function twoColEntry(left: string, right: string): string {
  if (!right) return oneColEntry(left)
  return `\\begin{twocolentry}{${right}}\n    ${left}\n\\end{twocolentry}`
}

export function oneColEntry(body: string): string {
  return `\\begin{onecolentry}\n    ${body}\n\\end{onecolentry}`
}

/** Bullets (already escaped) in the tight `highlights` list. */
export function highlights(items: readonly string[]): string {
  if (items.length === 0) return ''
  return oneColEntry(
    ['\\begin{highlights}', ...items.map((i) => `        \\item ${i}`), '    \\end{highlights}'].join('\n'),
  )
}
