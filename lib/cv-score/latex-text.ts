/**
 * v12.0 — LaTeX → plain text for scoring `latex_cv` documents.
 *
 * Design decision: we strip the stored LaTeX source to text instead of
 * compiling it (lib/latex/compile.ts calls an external service — slow, rate
 * limited and not needed to read the words). The resulting text is fed to the
 * same heuristic segmenter used for uploads. Macros we don't know (custom
 * `\entry{Role}{Company}{City}{Dates}` style resume commands) are rendered as
 * their arguments joined with " | " so role headers stay on one line.
 */

const DROP_WITH_ARGS = new Set([
  'documentclass', 'usepackage', 'newcommand', 'renewcommand', 'providecommand',
  'setlength', 'addtolength', 'vspace', 'hspace', 'titleformat', 'titlespacing',
  'pagestyle', 'thispagestyle', 'geometry', 'definecolor', 'color', 'setlist',
  'hypersetup', 'fontsize', 'input', 'include', 'includegraphics', 'label',
  'ref', 'pagenumbering', 'setmainfont', 'setsansfont', 'colorlet', 'moderncvstyle',
  'moderncvcolor', 'photo', 'rule', 'titlerule', 'raisebox', 'newenvironment',
  'renewenvironment', 'def', 'let', 'setcounter', 'addcontentsline', 'linespread',
])

const SECTION_CMDS = new Set(['section', 'subsection', 'subsubsection', 'cvsection', 'chapter'])
const FORMAT_CMDS = new Set([
  'textbf', 'textit', 'emph', 'underline', 'texttt', 'textsc', 'textsf', 'textrm',
  'textup', 'textmd', 'mbox', 'small', 'large', 'Large', 'LARGE', 'huge', 'Huge',
  'footnotesize', 'scriptsize', 'tiny', 'normalsize', 'bfseries', 'itshape',
  'scshape', 'mdseries', 'uppercase', 'MakeUppercase', 'textcolor', 'fbox', 'name',
])
const LINE_BREAK_CMDS = new Set(['newline', 'linebreak', 'par', 'hrule', 'medskip', 'bigskip', 'smallskip'])
const SYMBOLS: Record<string, string> = {
  textless: '<', textgreater: '>', textasciitilde: '~', textbackslash: '\\',
  textasciicircum: '^', textendash: '–', textemdash: '—', ldots: '…', dots: '…',
  textdollar: '$', textpercent: '%', LaTeX: 'LaTeX', TeX: 'TeX', textregistered: '®',
  texttrademark: '™', copyright: '©', textquoteright: "'", textquoteleft: "'",
  textbar: ' | ', cdot: ' | ', textbullet: ' | ', times: '×', rightarrow: '→', to: '→',
}
const LITERAL: Record<string, string> = {
  '&': '&', '%': '%', '$': '$', '#': '#', '_': '_', '{': '{', '}': '}',
  ' ': ' ', ',': ' ', ';': ' ', '!': '', '/': '',
}

/** Read a balanced `{…}` group starting at `i` (which must be `{`). */
function readGroup(src: string, i: number): { body: string; end: number } {
  let depth = 0
  for (let j = i; j < src.length; j++) {
    const c = src[j]
    if (c === '\\') {
      j++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return { body: src.slice(i + 1, j), end: j + 1 }
    }
  }
  return { body: src.slice(i + 1), end: src.length }
}

function skipOptional(src: string, i: number): number {
  let j = i
  while (src[j] === ' ') j++
  if (src[j] !== '[') return i
  const close = src.indexOf(']', j)
  return close === -1 ? i : close + 1
}

function arityOf(name: string): number {
  if (name === 'begin' || name === 'end') return 2
  if (name === 'href' || name === 'textcolor' || name === 'cvitem') return 2
  if (name === 'item' || name === 'resumeItem') return 0
  if (SECTION_CMDS.has(name) || FORMAT_CMDS.has(name) || name === 'url') return 1
  if (LINE_BREAK_CMDS.has(name)) return 0
  return Infinity
}

/**
 * Read up to `max` brace-group arguments. Only spaces (not newlines) may sit
 * between arguments so `\section{X}` + newline + `{body}` keeps the body.
 */
function readArgs(src: string, i: number, max = Infinity): { args: string[]; end: number } {
  const args: string[] = []
  let j = skipOptional(src, i)
  while (args.length < max) {
    let k = j
    while (src[k] === ' ') k++
    if (src[k] !== '{') break
    const g = readGroup(src, k)
    args.push(g.body)
    j = skipOptional(src, g.end)
  }
  return { args, end: j }
}

function stripComments(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '%' && line[i - 1] !== '\\') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

function convert(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === '\\') {
      const next = src[i + 1] ?? ''
      if (next === '\\') {
        out += '\n'
        i = skipOptional(src, i + 2)
        continue
      }
      if (next in LITERAL) {
        out += LITERAL[next]
        i += 2
        continue
      }
      const m = /^[A-Za-z]+\*?/.exec(src.slice(i + 1))
      if (!m) {
        i += 1
        continue
      }
      const name = m[0].replace(/\*$/, '')
      const { args, end } = readArgs(src, i + 1 + m[0].length, arityOf(name))
      i = end
      if (name === 'begin' || name === 'end') {
        // `\begin{itemize}` etc. — environment name is args[0]; drop it.
        // Extra args (e.g. tabular column spec) are layout, also dropped.
        out += '\n'
        continue
      }
      if (DROP_WITH_ARGS.has(name)) continue
      if (SECTION_CMDS.has(name)) {
        out += `\n${convert(args[0] ?? '')}\n`
        continue
      }
      if (name === 'item' || name === 'resumeItem' || name === 'cvitem') {
        out += `\n• ${args.map(convert).join(' ')}`
        continue
      }
      if (name === 'href') {
        const url = args[0] ?? ''
        const text = convert(args[1] ?? '')
        out += url.startsWith('mailto:') && !text.includes('@') ? url.slice(7) : text
        continue
      }
      if (name === 'url') {
        out += args[0] ?? ''
        continue
      }
      if (name === 'textcolor') {
        out += convert(args[1] ?? '')
        continue
      }
      if (FORMAT_CMDS.has(name)) {
        out += args.map(convert).join(' ')
        continue
      }
      if (LINE_BREAK_CMDS.has(name)) {
        out += '\n'
        continue
      }
      if (name === 'hfill' || name === 'quad' || name === 'qquad') {
        out += ' | '
        continue
      }
      if (name in SYMBOLS) {
        out += SYMBOLS[name]
        continue
      }
      if (args.length > 0) {
        // Unknown macro — likely a resume entry: keep its arguments.
        const parts = args.map((a) => convert(a).trim()).filter(Boolean)
        // Bullets nested in an argument must stay on their own lines.
        if (parts.length) out += `\n${parts.join(' | ').replace(/\s*\|\s*•/g, '\n•')}\n`
      }
      continue
    }
    if (c === '{' || c === '}') {
      i++
      continue
    }
    if (c === '~') {
      out += ' '
      i++
      continue
    }
    if (c === '&') {
      out += ' | '
      i++
      continue
    }
    if (c === '$') {
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * moderncv-style templates declare identity in the preamble (`\name`,
 * `\email`, `\phone`, `\social[linkedin]`, `\address`). Pull those into
 * header lines so contact detection still works.
 */
function preambleHeader(preamble: string): string {
  const arg = (cmd: string): string[] | null => {
    const i = preamble.search(new RegExp(`\\\\${cmd}(?![A-Za-z])`))
    if (i === -1) return null
    const { args } = readArgs(preamble, i + cmd.length + 1)
    return args.length ? args.map((a) => convert(a).trim()) : null
  }
  const name = arg('name')?.join(' ')
  const contact: string[] = []
  const email = arg('email')?.[0]
  if (email) contact.push(email)
  const phone = arg('phone')?.[0]
  if (phone) contact.push(phone)
  const address = arg('address')?.filter(Boolean).join(', ')
  if (address) contact.push(address)
  const social = /\\social\[linkedin\]\{([^}]+)\}/.exec(preamble)?.[1]
  if (social) contact.push(social.includes('linkedin.com') ? social : `linkedin.com/in/${social}`)
  return [name, contact.join(' | ')].filter(Boolean).join('\n')
}

/**
 * Convert LaTeX source to plain text. Only the document body is used; the
 * preamble carries no CV content except moderncv-style identity macros.
 */
export function latexToText(source: string): string {
  const noComments = stripComments(source ?? '')
  const begin = noComments.indexOf('\\begin{document}')
  const endIdx = noComments.indexOf('\\end{document}')
  const body =
    begin === -1
      ? noComments
      : noComments.slice(begin + '\\begin{document}'.length, endIdx === -1 ? undefined : endIdx)
  const header = begin === -1 ? '' : preambleHeader(noComments.slice(0, begin))
  const text = `${header}\n${convert(body)}`
    .replace(/---/g, '—')
    .replace(/--/g, '–')
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim())
    .filter((l, idx, arr) => l.length > 0 || (idx > 0 && arr[idx - 1] !== ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
