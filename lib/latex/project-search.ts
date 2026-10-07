// Find in project: plain-text search over the open project's text files.

export interface SearchHit {
  file: string
  /** 1-based line. */
  line: number
  /** 0-based column of the match. */
  column: number
  /** The line, trimmed to a readable window around the match. */
  preview: string
  /** Match offsets within `preview`. */
  start: number
  end: number
}

export const MAX_HITS = 200
const CONTEXT = 40

export function searchProject(
  files: readonly { name: string; text: string }[],
  query: string,
  opts: { caseSensitive?: boolean } = {},
): SearchHit[] {
  if (!query) return []
  const needle = opts.caseSensitive ? query : query.toLowerCase()
  const hits: SearchHit[] = []
  for (const file of files) {
    const lines = file.text.split('\n')
    for (let i = 0; i < lines.length && hits.length < MAX_HITS; i++) {
      const raw = lines[i]!
      const hay = opts.caseSensitive ? raw : raw.toLowerCase()
      let at = hay.indexOf(needle)
      while (at !== -1 && hits.length < MAX_HITS) {
        const from = Math.max(0, at - CONTEXT)
        const prefix = from > 0 ? '…' : ''
        const preview = prefix + raw.slice(from, at + query.length + CONTEXT)
        const start = prefix.length + (at - from)
        hits.push({ file: file.name, line: i + 1, column: at, preview, start, end: start + query.length })
        at = hay.indexOf(needle, at + Math.max(1, needle.length))
      }
    }
  }
  return hits
}
