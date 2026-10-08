import type { AIProvider } from '@/lib/ai/types'
import type { CallMeta } from '@/lib/ai/log'
import { canonicalUrl, extractUrls, linkOnlyBoard, urlAllowList, unwrapGoogleLink } from './urls'
import { routeLink } from './ats-route'
import { matchWatchEmployer } from '@/lib/discovery/ai-mode/employer-watch'
import { detectNationalsOnly } from '@/lib/discovery/relevance/signals'
import { MAX_PASTE_CHARS, type ExtractResult, type OpeningCandidate } from './types'

/**
 * Pasted text → openings for the review list.
 *
 * - With an AI provider: the model extracts title / employer / location /
 *   date / link; a link is kept only when that exact link (canonical form)
 *   occurs in the pasted text — anything else the model "found" is dropped.
 *   Links in the text the model skipped are added as link-only rows.
 * - Without one (no key) or when the call fails: one row per link, with a
 *   title guessed from the text on the same line. The user edits before
 *   importing.
 */

const MIN_AI_CHARS = 20

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index) + 1
  const endAt = text.indexOf('\n', index)
  return text.slice(start, endAt < 0 ? undefined : endAt)
}

/** "Backend Engineer at Acme (Dubai) https://…" → title, employer, location. */
export function guessFromLine(line: string): { title: string; employer: string; location: string } {
  const body = line
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\[([^\]]*)\]\(\s*\)/g, '$1')
    .replace(/^\s*(?:[-*•>#]+|\d+[.)])\s*/, '')
    .replace(/[*_`]+/g, '')
    .replace(/[\s.:–—|(-]*\b(?:link|apply(?: here)?|url|posting)\b[\s:]*$/i, '')
    .replace(/[\s.:–—|(-]+$/, '')
    .trim()
  const at = body.match(/^(.+?)\s+at\s+(.+?)(?:\s*[(,]\s*([^)]+)\)?)?$/i)
  if (at) return { title: at[1]!.trim(), employer: at[2]!.trim(), location: (at[3] ?? '').trim() }
  const parts = body.split(/\s+[—–|-]\s+/).map((p) => p.trim()).filter(Boolean)
  return { title: (parts[0] ?? '').slice(0, 200), employer: (parts[1] ?? '').slice(0, 200), location: (parts[2] ?? '').slice(0, 200) }
}

function describe(url: string, employer: string): Pick<OpeningCandidate, 'board' | 'ats' | 'watch'> {
  const w = matchWatchEmployer(url, employer)
  const watch = w ? { name: w.name, nationalsOnly: w.nationalsOnly } : null
  if (!url) return { board: null, ats: null, watch }
  const r = routeLink(url)
  return { board: linkOnlyBoard(url), ats: r.type === 'ats' ? r.route.kind : null, watch }
}

/** True when the text says the role is for nationals only (Emiratisation, "Saudi nationals only" …). */
export function saysNationalsOnly(text: string): boolean {
  return detectNationalsOnly(text) !== null
}

/** Link-only rows, one per URL in the text; links on a "nationals only" line are left out. */
export function candidatesFromUrls(text: string): OpeningCandidate[] {
  return extractUrls(text).flatMap((f, i) => {
    const line = lineAround(text, f.index)
    if (saysNationalsOnly(line)) return []
    const g = guessFromLine(line)
    return [{
      key: `u${i}`,
      title: g.title,
      employer: g.employer,
      location: g.location,
      postedDate: '',
      url: f.url,
      snippet: '',
      ...describe(f.url, g.employer),
    }]
  })
}

/** The model's link, kept only when it is one of the links in the pasted text. */
export function groundedUrl(modelUrl: string, allowed: ReadonlySet<string>): string {
  if (!modelUrl) return ''
  let parsed: URL
  try {
    parsed = new URL(modelUrl.trim())
  } catch {
    return ''
  }
  const target = unwrapGoogleLink(parsed)
  const canonical = target ? canonicalUrl(target) : null
  return canonical && allowed.has(canonical) ? canonical : ''
}

export async function extractOpenings(
  rawText: string,
  ai: AIProvider | null,
  meta: CallMeta = {},
): Promise<ExtractResult> {
  const text = rawText.slice(0, MAX_PASTE_CHARS)
  const fromUrls = candidatesFromUrls(text)
  if (!ai) return { candidates: fromUrls, mode: 'urls', note: 'No AI key: links only. Add a key in Settings › AI to read titles from text.' }
  if (text.trim().length < MIN_AI_CHARS) return { candidates: fromUrls, mode: 'urls', note: null }
  let modelItems
  try {
    modelItems = (await ai.extractOpenings({ text }, meta)).openings
  } catch {
    return { candidates: fromUrls, mode: 'urls', note: 'The AI could not read this text, so only its links are listed.' }
  }
  const allowed = urlAllowList(text)
  // Links whose line in the pasted text says "nationals only".
  const nationalsLinks = new Set(extractUrls(text).filter((f) => saysNationalsOnly(lineAround(text, f.index))).map((f) => f.url))
  const used = new Set<string>()
  let nationals = 0
  const fromAi: OpeningCandidate[] = modelItems.flatMap((m, i) => {
    const url = groundedUrl(m.url, allowed)
    if (url) used.add(url)
    if (nationalsLinks.has(url) || saysNationalsOnly(`${m.title}. ${m.employer}. ${m.snippet}`)) {
      nationals += 1
      return []
    }
    return [{
      key: `a${i}`,
      title: m.title,
      employer: m.employer,
      location: m.location,
      postedDate: m.posted_date,
      url,
      snippet: m.snippet,
      ...describe(url, m.employer),
    }]
  })
  const leftovers = fromUrls.filter((c) => !used.has(c.url))
  const note = nationals > 0 ? `${nationals} nationals-only opening${nationals === 1 ? '' : 's'} left out.` : null
  return { candidates: [...fromAi, ...leftovers], mode: 'ai', note }
}
