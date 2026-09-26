// ---------------------------------------------------------------------------
// Section outline and section folding (v17 §8.5 decision 7). Pure functions
// over the source text: the editor feeds them to its outline panel and to a
// CodeMirror fold service.
// ---------------------------------------------------------------------------

import { maskComments } from './completion-index'

export interface OutlineItem {
  command: string
  /** 0 part, 1 chapter, 2 section, 3 subsection, 4 subsubsection, 5 paragraph, 6 subparagraph */
  level: number
  title: string
  starred: boolean
  /** 1-based line of the heading command. */
  line: number
  /** Offset of the heading's backslash. */
  from: number
}

const LEVELS: Readonly<Record<string, number>> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
}

const HEADING =
  /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(?:\[[^\]]*\]\s*)?\{/g

/** Text of a balanced `{...}` group whose `{` is at `open`. */
function readGroup(source: string, open: number): string {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  return source.slice(open + 1)
}

function lineOf(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i++) if (source.charCodeAt(i) === 10) line++
  return line
}

export function extractOutline(source: string): OutlineItem[] {
  const masked = maskComments(source)
  const items: OutlineItem[] = []
  for (const m of masked.matchAll(HEADING)) {
    const open = m.index + m[0].length - 1
    items.push({
      command: m[1]!,
      level: LEVELS[m[1]!]!,
      title: readGroup(masked, open).replace(/\s+/g, ' ').trim(),
      starred: m[2] === '*',
      line: lineOf(source, m.index),
      from: m.index,
    })
  }
  return items
}

function lineEndAt(source: string, offset: number): number {
  const nl = source.indexOf('\n', offset)
  return nl === -1 ? source.length : nl
}

/**
 * Fold range for the heading on the line starting at `lineStart`: from the
 * end of the heading line to the end of the line before the next heading of
 * the same or a higher level (or `\end{document}`). Null when the line holds
 * no heading or the section is empty.
 */
export function sectionFoldRange(
  source: string,
  lineStart: number,
): { from: number; to: number } | null {
  const lineEnd = lineEndAt(source, lineStart)
  const outline = extractOutline(source)
  const index = outline.findIndex((o) => o.from >= lineStart && o.from <= lineEnd)
  if (index === -1) return null
  const heading = outline[index]!
  const next = outline.slice(index + 1).find((o) => o.level <= heading.level)
  const endDoc = maskComments(source).indexOf('\\end{document}', heading.from)
  const candidates = [next?.from, endDoc === -1 ? undefined : endDoc].filter(
    (n): n is number => n !== undefined,
  )
  const boundary = candidates.length > 0 ? Math.min(...candidates) : source.length
  // End of the last line before the boundary (without its newline).
  let to = boundary
  if (boundary < source.length || source.endsWith('\n')) {
    const lastNl = source.lastIndexOf('\n', boundary - 1)
    to = lastNl === -1 ? boundary : lastNl
  }
  return to > lineEnd ? { from: lineEnd, to } : null
}
