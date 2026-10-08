import type { ExtractOpeningsResult } from './prompts/extract-openings'

/**
 * Deterministic stand-in for `extractOpenings` (tests and local E2E): one
 * opening per line that names a role, read as
 *   "<title> at <employer> (<location>) <url>"  or
 *   "<title> — <employer> — <location> — <url>"
 * The URL is copied from the line as written, like the real prompt asks.
 */
export function pseudoExtractOpenings(text: string): ExtractOpeningsResult {
  const openings: ExtractOpeningsResult['openings'] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()
    if (!line) continue
    const url = line.match(/https?:\/\/\S+/)?.[0]?.replace(/[).,;]+$/, '') ?? ''
    const body = line
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[\s.:–—|-]*\b(?:link|apply(?: here)?|url)\b[\s:]*$/i, '')
      .replace(/[\s.:–—|-]+$/, '')
      .trim()
    let title = ''
    let employer = ''
    let location = ''
    const at = body.match(/^(.+?)\s+at\s+(.+?)(?:\s*\(([^)]+)\))?$/i)
    if (at) {
      title = at[1]!.trim()
      employer = at[2]!.trim()
      location = (at[3] ?? '').trim()
    } else {
      const parts = body.split(/\s+[—–|]\s+/).map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 2) [title = '', employer = '', location = ''] = parts
    }
    if (!title || !employer) continue
    openings.push({ title, employer, location, posted_date: '', url, snippet: '' })
  }
  return { openings: openings.slice(0, 30) }
}
