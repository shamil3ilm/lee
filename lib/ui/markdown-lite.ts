/**
 * A tiny, dependency-free Markdown subset parser for user and job text
 * (job descriptions, notes). It understands what those texts actually use:
 * `#`–`######` headings, `-`/`*`/`+` and `1.` lists, blank-line paragraphs,
 * and inline `**bold**` / `` `code` ``. Everything else stays plain text.
 * The output is data, rendered by components/markdown-text.tsx as React
 * elements, so no HTML string is ever injected.
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'code'; text: string }

export type MdBlock =
  | { type: 'heading'; level: number; inline: InlineNode[] }
  | { type: 'paragraph'; lines: InlineNode[][] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g

export function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push({ type: 'text', text: text.slice(last, at) })
    const tok = m[0]
    if (tok.startsWith('`')) out.push({ type: 'code', text: tok.slice(1, -1) })
    else out.push({ type: 'strong', text: tok.slice(2, -2) })
    last = at + tok.length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

export function parseMarkdownLite(source: string): MdBlock[] {
  const blocks: MdBlock[] = []
  let para: InlineNode[][] = []
  // Widened on purpose: the closures below reassign it, which TypeScript's
  // narrowing of a `= null` initialiser would not see.
  let list = null as { ordered: boolean; items: InlineNode[][] } | null

  const flushPara = (): void => {
    if (para.length) blocks.push({ type: 'paragraph', lines: para })
    para = []
  }
  const flushList = (): void => {
    if (list) blocks.push({ type: 'list', ...list })
    list = null
  }

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flushPara()
      flushList()
      blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2]) })
      continue
    }
    const bullet = BULLET.exec(line)
    const ordered = bullet ? null : ORDERED.exec(line)
    const item = bullet ?? ordered
    if (item) {
      flushPara()
      const isOrdered = Boolean(ordered)
      if (list && list.ordered !== isOrdered) flushList()
      list ??= { ordered: isOrdered, items: [] }
      list.items.push(parseInline(item[1]))
      continue
    }
    // A plain line right after a list item continues that item.
    if (list && /^\s/.test(raw) && list.items.length) {
      const lastItem = list.items[list.items.length - 1]
      list.items[list.items.length - 1] = [...lastItem, { type: 'text', text: ` ${line.trim()}` }]
      continue
    }
    flushList()
    para.push(parseInline(line.trim()))
  }
  flushPara()
  flushList()
  return blocks
}
