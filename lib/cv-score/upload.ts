/**
 * v12.0 — text extraction for uploaded CV files (PDF / DOCX / TXT / MD).
 *
 * PDFs are read as positioned text items (unpdf) and rebuilt into lines so
 * the segmenter sees real line breaks. Wide horizontal gaps between items on
 * the same line are kept as a run of spaces — that's the signal the
 * multi-column heuristic in extract.ts looks for.
 */
import { CvScoreError } from './errors'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ALLOWED_UPLOAD_TYPES = ['pdf', 'docx', 'txt', 'md'] as const
export type UploadFileType = (typeof ALLOWED_UPLOAD_TYPES)[number]

export interface ExtractedUpload {
  text: string
  fileType: UploadFileType
  pageCount?: number
}

export interface PositionedItem {
  str: string
  x: number
  y: number
  width: number
  fontSize: number
}

/** Rebuild reading-order lines from positioned PDF text items (one page). */
export function itemsToLines(items: PositionedItem[]): string[] {
  const usable = items.filter((i) => i.str.trim().length > 0)
  const sorted = [...usable].sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x))
  const rows: PositionedItem[][] = []
  for (const it of sorted) {
    const row = rows[rows.length - 1]
    const tol = Math.max(2, (it.fontSize || 10) * 0.4)
    if (row && Math.abs(row[0]!.y - it.y) <= tol) row.push(it)
    else rows.push([it])
  }
  return rows.map((row) => {
    const cells = [...row].sort((a, b) => a.x - b.x)
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
  })
}

export function fileTypeOf(name: string): UploadFileType | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(ext) ? (ext as UploadFileType) : null
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
    if (fileType === 'pdf') {
      const { extractTextItems, getDocumentProxy } = await import('unpdf')
      const doc = await getDocumentProxy(file.bytes)
      const { totalPages, items } = await extractTextItems(doc)
      const text = items.map((page) => itemsToLines(page as PositionedItem[]).join('\n')).join('\n')
      return { text, fileType, pageCount: totalPages }
    }
    if (fileType === 'docx') {
      const mod = await import('mammoth')
      const result = await mod.extractRawText({ buffer: Buffer.from(file.bytes) })
      return { text: result.value, fileType }
    }
    return { text: new TextDecoder('utf-8').decode(file.bytes), fileType }
  } catch (err) {
    if (err instanceof CvScoreError) throw err
    throw new CvScoreError('unreadable_file', "We couldn't read that file — is it a valid, unencrypted document?", 422)
  }
}
