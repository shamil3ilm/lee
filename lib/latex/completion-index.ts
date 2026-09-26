// ---------------------------------------------------------------------------
// Completion index for the LaTeX editor (v17 §8.5 decision 3). A regex scan
// of the document (plus its `.bib` assets and asset file names) that feeds
// the editor's own completion sources. Pure and framework-free so it can be
// unit-tested and reused (e.g. by a future multi-file project view).
// ---------------------------------------------------------------------------

export interface UserCommand {
  name: string
  /** Number of mandatory arguments (an optional first argument is excluded). */
  args: number
}

export interface CompletionIndex {
  commands: UserCommand[]
  environments: string[]
  labels: string[]
  citeKeys: string[]
  graphicsFiles: string[]
  inputFiles: string[]
}

export interface CompletionIndexInput {
  source: string
  /** Contents of every `.bib` asset of the document. */
  bibSources?: readonly string[]
  /** File names of the document's assets. */
  assetFilenames?: readonly string[]
}

/** Number of backslashes immediately before `index`. */
function backslashesBefore(text: string, index: number): number {
  let n = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) n++
  return n
}

/** Replace `% comments` with spaces, keeping every offset intact. */
export function maskComments(source: string): string {
  let out = ''
  let inComment = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!
    if (ch === '\n') {
      inComment = false
      out += ch
    } else if (inComment) {
      out += ' '
    } else if (ch === '%' && backslashesBefore(source, i) % 2 === 0) {
      inComment = true
      out += ' '
    } else {
      out += ch
    }
  }
  return out
}

interface Found<T> {
  at: number
  value: T
}

const NEWCOMMAND =
  /\\(?:re)?newcommand\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))\s*(?:\[(\d)\])?\s*(\[[^\]]*\])?/g
const PROVIDECOMMAND =
  /\\(?:providecommand|DeclareRobustCommand)\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))\s*(?:\[(\d)\])?\s*(\[[^\]]*\])?/g
const MATH_OPERATOR = /\\DeclareMathOperator\*?\s*\{\s*\\([A-Za-z@]+)\s*\}/g
const DEF = /\\(?:[gex]?def)\s*\\([A-Za-z@]+)((?:#\d)*)\s*\{/g
const NEWENVIRONMENT = /\\(?:re)?newenvironment\*?\s*\{([A-Za-z*@]+)\}/g
const LABEL = /\\label\s*\{([^{}\s]+)\}/g

function collectCommands(text: string): UserCommand[] {
  const found: Found<UserCommand>[] = []
  for (const re of [NEWCOMMAND, PROVIDECOMMAND]) {
    for (const m of text.matchAll(re)) {
      const name = (m[1] ?? m[2])!
      const total = m[3] ? Number(m[3]) : 0
      const args = Math.max(0, total - (m[4] ? 1 : 0))
      found.push({ at: m.index, value: { name, args } })
    }
  }
  for (const m of text.matchAll(MATH_OPERATOR)) found.push({ at: m.index, value: { name: m[1]!, args: 0 } })
  for (const m of text.matchAll(DEF)) {
    found.push({ at: m.index, value: { name: m[1]!, args: (m[2] ?? '').length / 2 } })
  }
  return uniqueBy(
    found.sort((a, b) => a.at - b.at).map((f) => f.value),
    (c) => c.name,
  )
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const BIB_ENTRY = /@([A-Za-z]+)\s*[{(]\s*([^,\s{}()]+)\s*,/g
const BIB_NON_ENTRIES = new Set(['string', 'comment', 'preamble'])

/** Citation keys of every entry in a BibTeX file, in file order. */
export function extractBibKeys(bib: string): string[] {
  const keys: string[] = []
  for (const m of bib.matchAll(BIB_ENTRY)) {
    if (!BIB_NON_ENTRIES.has(m[1]!.toLowerCase())) keys.push(m[2]!)
  }
  return keys
}

const GRAPHICS_EXT = /\.(?:png|jpe?g|pdf|eps)$/i

export function buildCompletionIndex(input: CompletionIndexInput): CompletionIndex {
  const text = maskComments(input.source)
  const files = input.assetFilenames ?? []
  return {
    commands: collectCommands(text),
    environments: uniqueBy(
      [...text.matchAll(NEWENVIRONMENT)].map((m) => m[1]!),
      (e) => e,
    ),
    labels: uniqueBy(
      [...text.matchAll(LABEL)].map((m) => m[1]!),
      (l) => l,
    ),
    citeKeys: uniqueBy((input.bibSources ?? []).flatMap(extractBibKeys), (k) => k),
    graphicsFiles: files.filter((f) => GRAPHICS_EXT.test(f)),
    inputFiles: files.filter((f) => !GRAPHICS_EXT.test(f)),
  }
}

// --- completion context ----------------------------------------------------

export type CompletionKind =
  | 'command'
  | 'environment'
  | 'end-environment'
  | 'ref'
  | 'cite'
  | 'graphics'
  | 'input'

export interface CompletionContext {
  kind: CompletionKind
  /** Offset (into the given text) where the completed word starts. */
  from: number
  prefix: string
}

const ARGUMENT_KINDS: ReadonlyArray<[RegExp, CompletionKind]> = [
  [/^begin$/, 'environment'],
  [/^end$/, 'end-environment'],
  [/^(?:ref|eqref|autoref|pageref|cref|Cref|nameref|vref)$/, 'ref'],
  [/^[A-Za-z]*cite[A-Za-z]*$/i, 'cite'],
  [/^(?:includegraphics|includepdf)$/, 'graphics'],
  [/^(?:input|include|subfile|lstinputlisting)$/, 'input'],
]

const OPEN_ARGUMENT = /\\([A-Za-z]+)\*?\s*(?:\[[^\]]*\]\s*)*\{([^{}]*)$/
const COMMAND_WORD = /\\([A-Za-z@]*)$/

/**
 * What to complete at `pos` in a line of text: a command name after `\`, or
 * the argument of a command that takes environments, labels, cite keys or
 * file names. Returns null in comments and plain text.
 */
export function completionContextAt(text: string, pos: number): CompletionContext | null {
  const before = text.slice(0, pos)
  // Inside a comment: masking changed something before the cursor.
  if (maskComments(before) !== before) return null
  const arg = OPEN_ARGUMENT.exec(before)
  if (arg && backslashesBefore(before, arg.index) % 2 === 0) {
    const match = ARGUMENT_KINDS.find(([re]) => re.test(arg[1]!))
    if (!match) return null
    const inside = arg[2]!
    const prefix = match[1] === 'cite' ? inside.slice(inside.lastIndexOf(',') + 1).trimStart() : inside
    return { kind: match[1], from: pos - prefix.length, prefix }
  }
  const cmd = COMMAND_WORD.exec(before)
  if (cmd && backslashesBefore(before, cmd.index) % 2 === 0) {
    return { kind: 'command', from: cmd.index, prefix: cmd[1]! }
  }
  return null
}

const BEGIN_OR_END = /\\(begin|end)\s*\{([^{}]+)\}/g

/** Innermost environment still open at the end of `textBefore`. */
export function innermostOpenEnvironment(textBefore: string): string | null {
  const stack: string[] = []
  for (const m of maskComments(textBefore).matchAll(BEGIN_OR_END)) {
    if (m[1] === 'begin') {
      stack.push(m[2]!)
    } else {
      const i = stack.lastIndexOf(m[2]!)
      if (i !== -1) stack.splice(i)
    }
  }
  return stack.at(-1) ?? null
}
