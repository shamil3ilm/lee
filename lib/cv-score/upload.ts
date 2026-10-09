/**
 * v12.0 — text extraction for uploaded CV files (PDF / DOCX / TXT / MD).
 *
 * PDFs are read as positioned text items (unpdf) and rebuilt into lines so
 * the segmenter sees real line breaks. Wide horizontal gaps between items on
 * the same line are kept as a run of spaces — that's the signal the
 * multi-column heuristic in extract.ts looks for.
 *
 * v1.1 — also returns per-line layout (x, right edge, vertical gap) so
 * wrapped lines can be joined into one bullet, and the file's hyperlinks
 * (PDF link annotations, DOCX hyperlinks) so "LinkedIn | GitHub" written as
 * link text still counts as contact details.
 */
import { CvScoreError } from './errors'
import type { LineLayout } from './types'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ALLOWED_UPLOAD_TYPES = ['pdf', 'docx', 'txt', 'md'] as const
export type UploadFileType = (typeof ALLOWED_UPLOAD_TYPES)[number]

export interface ExtractedUpload {
  text: string
  fileType: UploadFileType
  pageCount?: number
  /** v1.1 — hyperlink targets (absent when the file has none). */
  links?: string[]
  /** v1.1 — PDF only: layout per line of `text`. */
  layout?: (LineLayout | null)[]
}

export interface PositionedItem {
  str: string
  x: number
  y: number
  width: number
  fontSize: number
}

interface Row {
  items: PositionedItem[]
}

function toRows(items: PositionedItem[]): Row[] {
  const usable = items
    .map((i) => ({ ...i, str: i.str.replace(/[\r\n]+/g, ' ') }))
    .filter((i) => i.str.trim().length > 0)
  const sorted = [...usable].sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x))
  const rows: Row[] = []
  for (const it of sorted) {
    const row = rows[rows.length - 1]
    const tol = Math.max(2, (it.fontSize || 10) * 0.4)
    if (row && Math.abs(row.items[0]!.y - it.y) <= tol) row.items.push(it)
    else rows.push({ items: [it] })
  }
  return rows
}

function rowText(row: Row): string {
  const cells = [...row.items].sort((a, b) => a.x - b.x)
  let line = ''
  let prevEnd: number | null = null
  for (const c of cells) {
    if (prevEnd !== null) {
      const gap = c.x - prevEnd
      const fs = c.fontSize || 10
      line += gap > fs * 3 ? '    ' : gap > fs * 0.15 ? ' ' : ''
    }
    line += c.str
    prevEnd = c.x + c.width
  }
  return line.replace(/[ \t]+$/g, '')
}

/** Rebuild reading-order lines from positioned PDF text items (one page). */
export function itemsToLines(items: PositionedItem[]): string[] {
  return toRows(items).map(rowText)
}

/** Lines plus per-line layout for one page. */
export function itemsToLayoutLines(items: PositionedItem[], page: number): { lines: string[]; layout: LineLayout[] } {
  const rows = toRows(items)
  const lines: string[] = []
  const layout: LineLayout[] = []
  let prevY: number | null = null
  for (const row of rows) {
    const cells = [...row.items].sort((a, b) => a.x - b.x)
    const first = cells[0]!
    const last = cells[cells.length - 1]!
    const y = first.y
    const fontSize = Math.max(...cells.map((c) => c.fontSize || 10))
    lines.push(rowText(row))
    layout.push({
      page,
      x: Math.round(first.x * 10) / 10,
      right: Math.round((last.x + last.width) * 10) / 10,
      y: Math.round(y * 10) / 10,
      fontSize: Math.round(fontSize * 10) / 10,
      gapBefore: prevY === null ? 0 : Math.round(Math.abs(prevY - y) * 10) / 10,
    })
    prevY = y
  }
  return { lines, layout }
}

export function fileTypeOf(name: string): UploadFileType | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(ext) ? (ext as UploadFileType) : null
}

const HREF_RE = /<a\s[^>]*href="([^"]+)"/gi

/** Hyperlink targets from mammoth's HTML (DOCX). */
export function hrefsFromHtml(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(HREF_RE)) {
    const href = m[1]!.replace(/&amp;/g, '&').trim()
    if (href && !href.startsWith('#') && !out.includes(href)) out.push(href)
  }
  return out
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedUpload> {
  const { extractLinks, extractTextItems, getDocumentProxy } = await import('unpdf')
  const doc = await getDocumentProxy(bytes)
  const { totalPages, items } = await extractTextItems(doc)
  const lines: string[] = []
  const layout: LineLayout[] = []
  items.forEach((page, i) => {
    const out = itemsToLayoutLines(page as PositionedItem[], i + 1)
    lines.push(...out.lines)
    layout.push(...out.layout)
  })
  let links: string[] = []
  try {
    links = [...new Set((await extractLinks(doc)).links)]
  } catch {
    // Annotations are a bonus — a PDF whose links can't be read still scores.
    links = []
  }
  return {
    text: lines.join('\n'),
    fileType: 'pdf',
    pageCount: totalPages,
    layout,
    ...(links.length ? { links } : {}),
  }
}

const LI_RE = /<li>([\s\S]*?)<\/li>/gi
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
const BULLET_LEAD = /^\s*[•\-*·▪◦]/

/** Texts of Word list paragraphs (mammoth renders them as <li>). */
export function listItemsFromHtml(html: string): Set<string> {
  const out = new Set<string>()
  for (const m of html.matchAll(LI_RE)) {
    const text = m[1]!
      .replace(/<[^>]+>/g, '')
      .replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e)
      .trim()
    if (text) out.add(text)
  }
  return out
}

/**
 * Raw text drops Word's list bullets (they are numbering, not characters);
 * put a "• " back on list paragraphs so they read as bullets, like a PDF.
 */
export function markListItems(text: string, items: ReadonlySet<string>): string {
  if (items.size === 0) return text
  return text
    .split('\n')
    .map((line) => (items.has(line.trim()) && !BULLET_LEAD.test(line) ? `• ${line.trim()}` : line))
    .join('\n')
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedUpload> {
  const mod = await import('mammoth')
  const buffer = Buffer.from(bytes)
  const result = await mod.extractRawText({ buffer })
  let links: string[] = []
  let items = new Set<string>()
  try {
    const html = (await mod.convertToHtml({ buffer })).value
    links = hrefsFromHtml(html)
    items = listItemsFromHtml(html)
  } catch {
    links = []
  }
  return { text: markListItems(result.value, items), fileType: 'docx', ...(links.length ? { links } : {}) }
}

export async function extractUpload(file: { name: string; bytes: Uint8Array }): Promise<ExtractedUpload> {
  const fileType = fileTypeOf(file.name)
  if (!fileType) {
    throw new CvScoreError('unsupported_file', 'Upload a PDF, DOCX, TXT or MD file.', 415)
  }
  if (file.bytes.byteLength === 0) {
    throw new CvScoreError('empty_file', 'The uploaded file is empty.', 400)
  }
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new CvScoreError('file_too_large', 'File is larger than 5 MB.', 413)
  }
  try {
    if (fileType === 'pdf') return await extractPdf(file.bytes)
    if (fileType === 'docx') return await extractDocx(file.bytes)
    return { text: new TextDecoder('utf-8').decode(file.bytes), fileType }
  } catch (err) {
    if (err instanceof CvScoreError) throw err
    throw new CvScoreError('unreadable_file', "We couldn't read that file — is it a valid, unencrypted document?", 422)
  }
}
