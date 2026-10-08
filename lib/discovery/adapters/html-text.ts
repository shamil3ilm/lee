/**
 * Job descriptions arrive as HTML — sometimes entity-escaped HTML
 * (Greenhouse `content`, SuccessFactors CDATA: "&lt;p&gt;…"). The relevance
 * gate and the match score read plain text, so adapters hand it through
 * this: tags dropped, list items kept as "- " lines, entities decoded.
 */

const NAMED: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', middot: '·',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

/** Longest description kept; the gate reads the first 8 000 characters. */
export const MAX_DESCRIPTION = 20_000

export function htmlToText(html: string | null | undefined, max: number = MAX_DESCRIPTION): string {
  if (!html) return ''
  let s = html
  // Escaped markup: decode once so the tags below can be dropped.
  if (/&lt;\/?[a-z!]/i.test(s)) s = decodeEntities(s)
  s = s
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr|table|section)>/gi, '\n')
    // Inline tags join their text; any other tag separates words.
    .replace(/<\/?(?:b|i|u|em|strong|span|a|font|small|sup|sub|mark)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
  s = decodeEntities(s)
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .trim()
  return s.length > max ? s.slice(0, max) : s
}

/** Work mode named in a location / title / workplace label. */
export function workModeOf(text: string | null | undefined): 'remote' | 'hybrid' | 'onsite' | 'unknown' {
  const t = (text ?? '').toLowerCase()
  if (/\bhybrid\b/.test(t)) return 'hybrid'
  if (/\bremote\b|work from home|\bwfh\b|telecommut/.test(t)) return 'remote'
  if (/\bon[\s-]?site\b|\bin[\s-]office\b/.test(t)) return 'onsite'
  return 'unknown'
}

/**
 * Best-effort detail reads for list endpoints that carry no description
 * (Workday, Oracle): at most `max` items, `concurrency` at a time. A failed
 * read keeps the list item as it was, so a poll never fails over details.
 */
export async function enrichSome<T>(
  items: readonly T[],
  max: number,
  concurrency: number,
  enrich: (item: T) => Promise<T>,
): Promise<T[]> {
  const out = [...items]
  const limit = Math.min(max, out.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < limit) {
      const i = next++
      try {
        out[i] = await enrich(out[i]!)
      } catch {
        // Keep the list data.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, limit)) }, worker))
  return out
}
