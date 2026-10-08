import { BRIEF_SECTIONS, emptySections, type BriefSections, type CitedSentence } from './types'

/**
 * The verbatim citation check, the same idea as CV evidence quotes: every
 * sentence carries a quoted span and the id of the source it came from; the
 * span must appear verbatim in that source's fetched text, or the sentence
 * is dropped. Only whitespace and typographic quote/dash styles are
 * normalised — case and wording must match. Pure.
 */

export const MIN_QUOTE_CHARS = 20
export const MAX_QUOTE_CHARS = 300
export const MAX_SENTENCE_CHARS = 400
export const MAX_PER_SECTION = 4

export function normalizeQuote(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function quoteFound(quote: string, sourceText: string): boolean {
  const q = normalizeQuote(quote).replace(/^["']|["']$/g, '').trim()
  if (q.length < MIN_QUOTE_CHARS || q.length > MAX_QUOTE_CHARS) return false
  return normalizeQuote(sourceText).includes(q)
}

export interface RawSentence {
  text?: unknown
  quote?: unknown
  source?: unknown
}

function clean(raw: RawSentence, texts: ReadonlyMap<string, string>): CitedSentence | null {
  const text = typeof raw.text === 'string' ? raw.text.replace(/\s+/g, ' ').trim() : ''
  const quote = typeof raw.quote === 'string' ? raw.quote : ''
  const source = typeof raw.source === 'string' ? raw.source.trim() : ''
  const sourceText = texts.get(source)
  if (!text || text.length > MAX_SENTENCE_CHARS || sourceText === undefined) return null
  if (!quoteFound(quote, sourceText)) return null
  return { text, quote: normalizeQuote(quote).replace(/^["']|["']$/g, '').trim(), source }
}

/**
 * Keep only sentences whose quote is found verbatim in the cited source.
 * `texts` maps source id → fetched text.
 */
export function filterCitations(
  raw: Partial<Record<string, readonly RawSentence[] | undefined>>,
  texts: ReadonlyMap<string, string>,
): { sections: BriefSections; kept: number; dropped: number } {
  const sections = emptySections()
  let kept = 0
  let dropped = 0
  for (const id of BRIEF_SECTIONS) {
    const list = Array.isArray(raw[id]) ? (raw[id] as readonly RawSentence[]) : []
    for (const r of list) {
      const s = clean(r, texts)
      if (s && sections[id].length < MAX_PER_SECTION) {
        sections[id] = [...sections[id], s]
        kept += 1
      } else {
        dropped += 1
      }
    }
  }
  return { sections, kept, dropped }
}
