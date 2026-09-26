// ---------------------------------------------------------------------------
// Built-in LaTeX vocabulary for editor autocomplete: common commands and
// environments. Templates use CodeMirror snippet syntax: `${}` / `${name}`
// are tab-stops. A literal `{` or `}` right after a backslash (`\{`) would
// be read as an escape by the snippet parser, so none of these use one.
// ---------------------------------------------------------------------------

export interface CommandSpec {
  name: string
  /** Snippet inserted in place of `\name`; defaults to `\name`. */
  template?: string
  detail?: string
}

export interface EnvironmentSpec {
  name: string
  /** Body lines between \begin and \end (snippet syntax). */
  body?: string
  /** Text after `\begin{name}` on the same line, e.g. `{${cols}}`. */
  args?: string
}

const arg1 = (name: string, detail?: string): CommandSpec => ({
  name,
  template: `\\${name}{\${}}`,
  detail,
})

export const COMMANDS: readonly CommandSpec[] = [
  { name: 'documentclass', template: '\\documentclass{${article}}', detail: 'preamble' },
  { name: 'usepackage', template: '\\usepackage{${package}}', detail: 'preamble' },
  { name: 'usepackage', template: '\\usepackage[${options}]{${package}}', detail: 'with options' },
  arg1('title', 'preamble'),
  arg1('author', 'preamble'),
  arg1('date', 'preamble'),
  { name: 'maketitle' },
  { name: 'tableofcontents' },
  arg1('part', 'heading'),
  arg1('chapter', 'heading'),
  arg1('section', 'heading'),
  { name: 'section*', template: '\\section*{${}}', detail: 'heading, unnumbered' },
  arg1('subsection', 'heading'),
  { name: 'subsection*', template: '\\subsection*{${}}', detail: 'heading, unnumbered' },
  arg1('subsubsection', 'heading'),
  arg1('paragraph', 'heading'),
  arg1('textbf', 'bold'),
  arg1('textit', 'italic'),
  arg1('emph', 'emphasis'),
  arg1('underline'),
  arg1('texttt', 'monospace'),
  arg1('textsc', 'small caps'),
  arg1('textsf', 'sans serif'),
  arg1('textrm'),
  arg1('text', 'text in math'),
  arg1('footnote'),
  arg1('label'),
  arg1('ref'),
  arg1('eqref'),
  arg1('pageref'),
  arg1('autoref'),
  arg1('cite'),
  { name: 'cite', template: '\\cite[${page}]{${key}}', detail: 'with note' },
  arg1('citep'),
  arg1('citet'),
  arg1('nocite'),
  { name: 'bibliography', template: '\\bibliography{${refs}}' },
  { name: 'bibliographystyle', template: '\\bibliographystyle{${plain}}' },
  { name: 'href', template: '\\href{${url}}{${text}}', detail: 'hyperref' },
  arg1('url', 'hyperref'),
  { name: 'includegraphics', template: '\\includegraphics[width=${0.5}\\textwidth]{${file}}', detail: 'graphicx' },
  { name: 'includepdf', template: '\\includepdf[pages=-]{${file}}', detail: 'pdfpages' },
  arg1('input', 'include a file'),
  arg1('include', 'include a file'),
  arg1('caption'),
  { name: 'item' },
  { name: 'item', template: '\\item[${label}] ${}', detail: 'with label' },
  { name: 'newcommand', template: '\\newcommand{\\${name}}{${body}}', detail: 'define a command' },
  { name: 'renewcommand', template: '\\renewcommand{\\${name}}{${body}}' },
  { name: 'newenvironment', template: '\\newenvironment{${name}}{${begin}}{${end}}' },
  { name: 'setlength', template: '\\setlength{\\${length}}{${value}}' },
  { name: 'vspace', template: '\\vspace{${1em}}' },
  { name: 'hspace', template: '\\hspace{${1em}}' },
  { name: 'newline' },
  { name: 'newpage' },
  { name: 'clearpage' },
  { name: 'noindent' },
  { name: 'centering' },
  { name: 'hfill' },
  { name: 'vfill' },
  { name: 'small' },
  { name: 'footnotesize' },
  { name: 'large' },
  { name: 'Large' },
  { name: 'LARGE' },
  { name: 'huge' },
  { name: 'textwidth' },
  { name: 'linewidth' },
  { name: 'today' },
  { name: 'LaTeX' },
  { name: 'textcolor', template: '\\textcolor{${color}}{${text}}', detail: 'xcolor' },
  { name: 'color', template: '\\color{${color}}', detail: 'xcolor' },
  { name: 'frac', template: '\\frac{${num}}{${den}}', detail: 'math' },
  { name: 'sqrt', template: '\\sqrt{${}}', detail: 'math' },
  { name: 'sum', template: '\\sum_{${i=1}}^{${n}}', detail: 'math' },
  { name: 'prod', template: '\\prod_{${i=1}}^{${n}}', detail: 'math' },
  { name: 'int', template: '\\int_{${a}}^{${b}}', detail: 'math' },
  { name: 'lim', template: '\\lim_{${x \\to \\infty}}', detail: 'math' },
  { name: 'left', template: '\\left( ${} \\right)', detail: 'math' },
  { name: 'mathbb', template: '\\mathbb{${R}}', detail: 'math' },
  { name: 'mathcal', template: '\\mathcal{${}}', detail: 'math' },
  { name: 'mathbf', template: '\\mathbf{${}}', detail: 'math' },
  { name: 'mathrm', template: '\\mathrm{${}}', detail: 'math' },
  { name: 'binom', template: '\\binom{${n}}{${k}}', detail: 'math' },
  ...'alpha beta gamma delta epsilon theta lambda mu pi sigma phi omega Gamma Delta Lambda Sigma Omega'
    .split(' ')
    .map((name) => ({ name, detail: 'math' })),
  ...'infty partial nabla cdot times le ge neq approx equiv in subset cup cap forall exists to rightarrow Rightarrow ldots cdots'
    .split(' ')
    .map((name) => ({ name, detail: 'math' })),
]

export const ENVIRONMENTS: readonly EnvironmentSpec[] = [
  { name: 'document', body: '${}' },
  { name: 'itemize', body: '\t\\item ${}' },
  { name: 'enumerate', body: '\t\\item ${}' },
  { name: 'description', body: '\t\\item[${label}] ${}' },
  {
    name: 'figure',
    args: '[${htbp}]',
    body: '\t\\centering\n\t\\includegraphics[width=${0.8}\\linewidth]{${file}}\n\t\\caption{${caption}}\n\t\\label{fig:${label}}',
  },
  {
    name: 'table',
    args: '[${htbp}]',
    body: '\t\\centering\n\t\\begin{tabular}{${ll}}\n\t\t${} \\\\\n\t\\end{tabular}\n\t\\caption{${caption}}\n\t\\label{tab:${label}}',
  },
  { name: 'tabular', args: '{${ll}}', body: '\t${} \\\\' },
  { name: 'center', body: '\t${}' },
  { name: 'flushleft', body: '\t${}' },
  { name: 'flushright', body: '\t${}' },
  { name: 'quote', body: '\t${}' },
  { name: 'quotation', body: '\t${}' },
  { name: 'abstract', body: '\t${}' },
  { name: 'minipage', args: '{${0.45}\\textwidth}', body: '\t${}' },
  { name: 'equation', body: '\t${}' },
  { name: 'equation*', body: '\t${}' },
  { name: 'align', body: '\t${} &= ${} \\\\' },
  { name: 'align*', body: '\t${} &= ${} \\\\' },
  { name: 'gather', body: '\t${}' },
  { name: 'cases', body: '\t${} & ${} \\\\' },
  { name: 'pmatrix', body: '\t${} & ${} \\\\' },
  { name: 'bmatrix', body: '\t${} & ${} \\\\' },
  { name: 'verbatim', body: '${}' },
  { name: 'thebibliography', args: '{99}', body: '\t\\bibitem{${key}} ${}' },
]

/** Snippet for a whole environment, starting at `\begin{`. */
export function environmentTemplate(env: EnvironmentSpec): string {
  return `\\begin{${env.name}}${env.args ?? ''}\n${env.body ?? '\t${}'}\n\\end{${env.name}}`
}

/** Snippet for the rest of an environment after `\begin{` was typed. */
export function environmentTailTemplate(env: EnvironmentSpec): string {
  return `${env.name}}${env.args ?? ''}\n${env.body ?? '\t${}'}\n\\end{${env.name}}`
}
