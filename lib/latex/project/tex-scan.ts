// Light LaTeX scanning for a project import: comments, file references
// (`\includegraphics`, `\input`, `\bibliography`, …) with their positions,
// and `\graphicspath`. Not a TeX parser: it reads the common, literal forms
// Overleaf projects use and ignores arguments built from macros.

/** Replace every comment (from an unescaped % to the line end) with spaces, keeping offsets. */
export function maskComments(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const nl = text.indexOf('\n', i)
    const end = nl < 0 ? text.length : nl
    const line = text.slice(i, end)
    out += maskLine(line)
    if (nl >= 0) out += '\n'
    i = end + 1
  }
  return out
}

function maskLine(line: string): string {
  for (let j = 0; j < line.length; j++) {
    if (line[j] !== '%') continue
    let slashes = 0
    for (let k = j - 1; k >= 0 && line[k] === '\\'; k--) slashes++
    if (slashes % 2 === 0) return line.slice(0, j) + ' '.repeat(line.length - j)
  }
  return line
}

export type RefCommand =
  | 'includegraphics'
  | 'includepdf'
  | 'includesvg'
  | 'input'
  | 'include'
  | 'subfile'
  | 'bibliography'
  | 'addbibresource'
  | 'lstinputlisting'
  | 'verbatiminput'

export interface TexRef {
  command: RefCommand
  /** The argument as written (trimmed). */
  arg: string
  /** Offsets of `arg` in the file's text. */
  start: number
  end: number
  /** 1-based line of the argument. */
  line: number
}

export interface GraphicsPathEntry {
  dir: string
  start: number
  end: number
  line: number
}

const COMMANDS =
  /\\(includegraphics|includepdf|includesvg|input|include|subfile|bibliography|addbibresource|lstinputlisting|verbatiminput|graphicspath)\*?(?![A-Za-z@])/g

function lineAt(starts: readonly number[], offset: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid]! <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return starts
}

/** Index just past a balanced group starting at `open` ('{' or '['), or -1. */
function skipGroup(text: string, open: number, o: string, c: string): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === o) depth++
    else if (ch === c) {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function skipSpace(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i]!)) i++
  return i
}

/** True for an argument lee can resolve literally (no macros, no parameters). */
function isLiteral(arg: string): boolean {
  return arg.length > 0 && !/[\\#{}]/.test(arg)
}

/** Split `a, b` keeping each part's offsets. */
function splitList(arg: string, base: number): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = []
  let pos = 0
  for (const part of arg.split(',')) {
    const lead = part.length - part.trimStart().length
    const text = part.trim()
    if (text) out.push({ text, start: base + pos + lead, end: base + pos + lead + text.length })
    pos += part.length + 1
  }
  return out
}

export interface TexScan {
  refs: TexRef[]
  graphicsPaths: GraphicsPathEntry[]
}

/** File references and \graphicspath entries in one file's text (comments ignored). */
export function scanTex(text: string): TexScan {
  const masked = maskComments(text)
  const starts = lineStarts(text)
  const refs: TexRef[] = []
  const graphicsPaths: GraphicsPathEntry[] = []
  for (const m of masked.matchAll(COMMANDS)) {
    const command = m[1]!
    let i = skipSpace(masked, m.index! + m[0].length)
    while (masked[i] === '[') {
      const next = skipGroup(masked, i, '[', ']')
      if (next < 0) break
      i = skipSpace(masked, next)
    }
    if (masked[i] !== '{') continue
    const close = skipGroup(masked, i, '{', '}')
    if (close < 0) continue
    const inner = masked.slice(i + 1, close - 1)
    const innerStart = i + 1
    if (command === 'graphicspath') {
      for (const g of inner.matchAll(/\{([^{}]*)\}/g)) {
        const dir = g[1]!.trim()
        if (!isLiteral(dir)) continue
        const start = innerStart + g.index! + 1 + (g[1]!.length - g[1]!.trimStart().length)
        graphicsPaths.push({ dir, start, end: start + dir.length, line: lineAt(starts, start) })
      }
      continue
    }
    const parts =
      command === 'bibliography' || command === 'addbibresource'
        ? splitList(inner, innerStart)
        : [{ text: inner.trim(), start: innerStart + (inner.length - inner.trimStart().length), end: 0 }]
    for (const part of parts) {
      if (!isLiteral(part.text)) continue
      refs.push({
        command: command as RefCommand,
        arg: part.text,
        start: part.start,
        end: part.start + part.text.length,
        line: lineAt(starts, part.start),
      })
    }
  }
  return { refs, graphicsPaths }
}

/** Packages loaded with \usepackage / \RequirePackage (comments ignored), with their options. */
export function loadedPackages(text: string): Map<string, string> {
  const masked = maskComments(text)
  const out = new Map<string, string>()
  for (const m of masked.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g)) {
    for (const name of m[2]!.split(',')) {
      const n = name.trim()
      if (n) out.set(n, m[1] ?? '')
    }
  }
  return out
}

/** True for a complete document: \documentclass and \begin{document}, outside comments. */
export function isRootDocument(text: string): boolean {
  const masked = maskComments(text)
  return /\\documentclass\s*(?:\[[^\]]*\]\s*)?\{/.test(masked) && /\\begin\s*\{document\}/.test(masked)
}
