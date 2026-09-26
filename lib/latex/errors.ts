// ---------------------------------------------------------------------------
// Parse a latexonline.cc / pdflatex log fragment for well-known error shapes
// and surface a one-line suggested action. The output is UI-facing copy —
// the raw log is still shown for context, but a hint makes the fix a single
// action away (usually "add \usepackage{...}" or "upload the missing asset").
// ---------------------------------------------------------------------------

export interface LatexHint {
  /** Human-readable suggestion shown next to the raw log. */
  message: string
  /** Machine-readable tag for automation (tests, future auto-fix). */
  kind:
    | 'missing_package'
    | 'missing_asset'
    | 'undefined_command'
    | 'missing_font'
    | 'unclosed_environment'
}

interface HintPattern {
  pattern: RegExp
  toHint: (match: RegExpMatchArray) => LatexHint
}

const HINT_PATTERNS: HintPattern[] = [
  {
    // "! LaTeX Error: File `pdfpages.sty' not found."
    // "! LaTeX Error: File `graphicx.sty' not found."
    pattern: /File `([\w-]+)\.sty' not found/,
    toHint: (m) => ({
      kind: 'missing_package',
      message: `Add \\usepackage{${m[1]}} to your preamble.`,
    }),
  },
  {
    // "! LaTeX Error: File `foo.tex' not found." — non-.sty missing input.
    pattern: /File `([^']+)' not found/,
    toHint: (m) => ({
      kind: 'missing_asset',
      message: `Missing file "${m[1]}" — upload it via the Assets panel (or fix the filename).`,
    }),
  },
  {
    // "! Font T1/OpenSans/m/n/10.95=OpenSans-Regular not loadable"
    pattern: /Font [^ ]+=([\w-]+)[^ ]* not loadable/,
    toHint: (m) => ({
      kind: 'missing_font',
      message: `Font "${m[1]}" is not available on latexonline.cc. Consider swapping to a bundled font (e.g. Latin Modern).`,
    }),
  },
  {
    // "! Undefined control sequence.\nl.5 \foo" (raw) or
    // "main.tex:5: error: Undefined control sequence\n  at \foo" (latexonline).
    // TeX breaks the context line right after the offending command, so it
    // is the LAST command on that line.
    // latexonline also prints a caret line under the break point.
    pattern: /Undefined control sequence\.?[^\n]*\n(?:[^\n]*\n){0,3}?(\s*at |l\.\d+ )([^\n]*\\[A-Za-z@]+[^\n]*)(?:\n( *)\^)?/,
    toHint: (m) => {
      const caret = m[3] === undefined ? -1 : m[3].length - m[1]!.length
      const context = caret > 0 ? m[2]!.slice(0, caret) : m[2]!
      const commands = [...context.matchAll(/\\([A-Za-z@]+)/g)]
      const name = commands.at(-1)?.[1] ?? ''
      return {
        kind: 'undefined_command',
        message: `\\${name} is undefined — check the spelling or add the \\usepackage that defines it.`,
      }
    },
  },
  {
    // "! LaTeX Error: \begin{document} ended by \end{itemize}."
    pattern: /\\begin\{(\w+)\} ended by \\end\{(\w+)\}/,
    toHint: (m) => ({
      kind: 'unclosed_environment',
      message: `\\begin{${m[1]}} was closed by \\end{${m[2]}} — check for a mismatched or missing \\end.`,
    }),
  },
]

/**
 * Return the first matching hint for a compile log, or null when nothing
 * useful is recognised. Callers should still show the raw log — the hint is
 * additive, not a replacement.
 */
export function extractLatexHint(log: string): LatexHint | null {
  if (!log) return null
  for (const { pattern, toHint } of HINT_PATTERNS) {
    const m = log.match(pattern)
    if (m) return toHint(m)
  }
  return null
}

// ---------------------------------------------------------------------------
// Compile-log parser (v17 §8.5 decision 4). Written from scratch for lee —
// no code or grammar from Overleaf (AGPL) — using the standard method for
// reading TeX logs:
//   - rejoin lines TeX hard-wrapped at max_print_line (79 columns);
//   - `!` errors, with the source line taken from the following `l.<n>`;
//   - a `(` / `)` file stack, so an error is attributed to the file TeX was
//     reading (main.tex vs. a package);
//   - LaTeX, class and package warnings, and over/underfull box warnings.
// It also reads the latexonline.cc response format (`file:line: error: msg`
// followed by indented context), which is what the production compile
// service returns.
// ---------------------------------------------------------------------------

export type LogSeverity = 'error' | 'warning' | 'typesetting'

export interface LogEntry {
  severity: LogSeverity
  message: string
  /** Normalised file name: `main.tex` for the editor's file, else the path. */
  file: string | null
  /** 1-based source line, when the log names one. */
  line: number | null
  /** Source excerpt / context lines printed with the message. */
  context: string
}

export interface ParsedLog {
  all: LogEntry[]
  errors: LogEntry[]
  warnings: LogEntry[]
  typesetting: LogEntry[]
}

const MAX_PRINT_LINE = 79
const MAIN_FILE = 'main.tex'

/** Undo TeX's hard wrap: a line of exactly 79 columns continues on the next. */
export function rejoinWrappedLines(lines: readonly string[]): string[] {
  const out: string[] = []
  let pending: string | null = null
  for (const line of lines) {
    const joined: string = pending === null ? line : pending + line
    if (line.length === MAX_PRINT_LINE) {
      pending = joined
      continue
    }
    out.push(joined)
    pending = null
  }
  if (pending !== null) out.push(pending)
  return out
}

function normaliseFile(path: string): string {
  const trimmed = path.trim()
  const base = trimmed.split(/[\\/]/).pop() ?? trimmed
  if (base === MAIN_FILE) return MAIN_FILE
  return trimmed.replace(/^\.\//, '')
}

/** True when a log entry points at the document open in the editor. */
export function isMainFile(file: string | null): boolean {
  return file === null || file === MAIN_FILE
}

function isBoxWarning(message: string): boolean {
  return /^(?:Over|Under)full \\[hv]box\b/.test(message)
}

function boxLine(message: string): number | null {
  const m = /\bat lines? (\d+)/.exec(message)
  return m ? Number(m[1]) : null
}

function inputLine(message: string): number | null {
  const m = /on input line (\d+)/.exec(message)
  return m ? Number(m[1]) : null
}

function entry(
  severity: LogSeverity,
  message: string,
  file: string | null,
  line: number | null,
  context = '',
): LogEntry {
  return { severity, message: message.trim(), file, line, context: context.trim() }
}

// --- latexonline.cc format -------------------------------------------------

const SERVICE_LINE = /^(\S[^:]*?):(?:(\d+):)? (error|warning): (.*)$/

function parseServiceFormat(lines: readonly string[]): LogEntry[] {
  const entries: LogEntry[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = SERVICE_LINE.exec(lines[i]!)
    if (!m) continue
    const context: string[] = []
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) {
      context.push(lines[i + 1]!.trim())
      i++
    }
    const [, file, lineNo, kind, message] = m
    const severity: LogSeverity =
      kind === 'error' ? 'error' : isBoxWarning(message!) ? 'typesetting' : 'warning'
    entries.push(
      entry(severity, message!, normaliseFile(file!), lineNo ? Number(lineNo) : null, context.join('\n')),
    )
  }
  return entries
}

// --- raw TeX log format ----------------------------------------------------

const FILE_OPEN = /^\(([^\s()[\]{}"]+)/

function looksLikeFile(path: string): boolean {
  return /^(?:\.{0,2}\/|[A-Za-z]:[\\/])/.test(path) || /\.[A-Za-z][A-Za-z0-9]*$/.test(path)
}

/** Track `(file` / `)` on a line; non-file parentheses push a null marker. */
function updateFileStack(line: string, stack: (string | null)[]): void {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '(') {
      const m = FILE_OPEN.exec(line.slice(i))
      if (m && looksLikeFile(m[1]!)) {
        stack.push(normaliseFile(m[1]!))
        i += m[1]!.length
      } else {
        stack.push(null)
      }
    } else if (ch === ')' && stack.length > 0) {
      stack.pop()
    }
  }
}

function currentFile(stack: readonly (string | null)[]): string | null {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i]) return stack[i]!
  return null
}

const FILE_LINE_ERROR = /^(\S+?\.[A-Za-z]\w*):(\d+): (.*)$/
const FILE_LINE_ERROR_ANYWHERE = /^\S+?\.[A-Za-z]\w*:\d+: (?!error: |warning: )/m
const LATEX_WARNING = /^LaTeX(?: \w+)? Warning: (.*)$/
const PACKAGE_WARNING = /^(?:Package|Class) (\S+) Warning: .*$/

interface ScanResult {
  line: number | null
  context: string
  /** Index of the last line that belongs to this message. */
  end: number
}

/** After a `!` error, find `l.<n>` before the next error. */
function scanForSourceLine(lines: readonly string[], start: number): ScanResult {
  for (let j = start + 1; j < lines.length && j <= start + 40; j++) {
    const text = lines[j]!
    if (text.startsWith('! ') || FILE_LINE_ERROR.test(text)) break
    const m = /^l\.(\d+) ?(.*)$/.exec(text)
    if (m) {
      const rest = (lines[j + 1] ?? '').trim()
      return { line: Number(m[1]), context: [m[2], rest].filter(Boolean).join(' '), end: j + 1 }
    }
  }
  return { line: null, context: '', end: start }
}

/** Continuation lines of a warning: indented, or prefixed `(package)`. */
function collectContinuation(
  lines: readonly string[],
  start: number,
  pkg: string | null,
): { text: string; end: number } {
  const parts: string[] = []
  let j = start + 1
  for (; j < lines.length; j++) {
    const text = lines[j]!
    if (pkg && text.startsWith(`(${pkg})`)) parts.push(text.slice(pkg.length + 2).trim())
    else if (!pkg && /^\s+\S/.test(text)) parts.push(text.trim())
    else break
  }
  return { text: parts.join(' '), end: j - 1 }
}

function skipToBlank(lines: readonly string[], start: number): number {
  let j = start + 1
  while (j < lines.length && lines[j]!.trim() !== '') j++
  return j
}

function parseRawFormat(rawLines: readonly string[]): LogEntry[] {
  const lines = rejoinWrappedLines(rawLines)
  const entries: LogEntry[] = []
  const stack: (string | null)[] = []
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!
    const fle = FILE_LINE_ERROR.exec(text)
    if (text.startsWith('! ') || fle) {
      const message = (fle ? fle[3]! : text.slice(2)).replace(/^LaTeX Error: /, '')
      const scan = scanForSourceLine(lines, i)
      const file = fle ? normaliseFile(fle[1]!) : currentFile(stack)
      entries.push(entry('error', message, file, fle ? Number(fle[2]) : scan.line, scan.context))
      i = Math.max(i, scan.end)
      continue
    }
    if (text === 'Runaway argument?') {
      i++ // the next line is the user's text: never read it as file parens
      continue
    }
    const latexWarning = LATEX_WARNING.exec(text)
    const packageWarning = latexWarning ? null : PACKAGE_WARNING.exec(text)
    if (latexWarning || packageWarning) {
      const cont = collectContinuation(lines, i, packageWarning ? packageWarning[1]! : null)
      const head = latexWarning ? latexWarning[1]! : text
      const message = [head, cont.text].filter(Boolean).join(' ')
      entries.push(entry('warning', message, currentFile(stack), inputLine(message)))
      i = cont.end
      continue
    }
    if (isBoxWarning(text)) {
      entries.push(entry('typesetting', text, currentFile(stack), boxLine(text)))
      i = skipToBlank(lines, i) // box contents are user text
      continue
    }
    updateFileStack(text, stack)
  }
  return inheritEmergencyStopLines(entries)
}

/**
 * A missing `\input` file reports its error before TeX prints `l.<n>` for
 * the emergency stop it causes; give the first error that line too.
 */
function inheritEmergencyStopLines(entries: readonly LogEntry[]): LogEntry[] {
  return entries.map((e, i) => {
    const next = entries[i + 1]
    if (
      e.severity === 'error' &&
      e.line === null &&
      next?.severity === 'error' &&
      next.message.startsWith('Emergency stop') &&
      next.line !== null &&
      next.file === e.file
    ) {
      return { ...e, line: next.line }
    }
    return e
  })
}

function isRawTexLog(log: string): boolean {
  return /^(?:This is \S*TeX|! |\*\*)/m.test(log) || FILE_LINE_ERROR_ANYWHERE.test(log)
}

/** Parse a compile log into errors, warnings and box (typesetting) warnings. */
export function parseLatexLog(log: string): ParsedLog {
  const text = log ?? ''
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const all = isRawTexLog(text) ? parseRawFormat(lines) : parseServiceFormat(lines)
  return {
    all,
    errors: all.filter((e) => e.severity === 'error'),
    warnings: all.filter((e) => e.severity === 'warning'),
    typesetting: all.filter((e) => e.severity === 'typesetting'),
  }
}
