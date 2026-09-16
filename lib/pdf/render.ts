import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { CvPdfDocument } from './cv-template'
import { CoverLetterPdfDocument, type CoverLetterSender } from './cover-letter-template'
import type { CoverLetter, MasterCV, TailoredCV } from '@/lib/documents/types'

// Buffer output is easier for Next route handlers (return as Response body)
// than the async ReactPDFStream API. Renders happen server-side in Node.
export async function renderCvPdf(cv: MasterCV | TailoredCV): Promise<Buffer> {
  return renderToBuffer(createElement(CvPdfDocument, { cv }))
}

export async function renderCoverLetterPdf(
  letter: CoverLetter,
  sender?: CoverLetterSender,
): Promise<Buffer> {
  return renderToBuffer(createElement(CoverLetterPdfDocument, { letter, sender }))
}
