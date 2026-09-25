import { renderToBuffer } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { CvPdfDocument } from './cv-template'
import { CoverLetterPdfDocument, type CoverLetterSender } from './cover-letter-template'
import { PrepPackPdfDocument } from './prep-pack-template'
import { DebriefPdfDocument } from './debrief-template'
import type {
  CoverLetter,
  InterviewDebrief,
  InterviewPrepPack,
  MasterCV,
  TailoredCV,
} from '@/lib/documents/types'

// @react-pdf's renderToBuffer types the arg as its own DocumentProps element,
// but at runtime any component whose root is <Document> works. Cast the
// createElement output through unknown to satisfy the compiler without adding
// a type-shape assertion elsewhere.
type PdfElement = Parameters<typeof renderToBuffer>[0]

// Buffer output is easier for Next route handlers (return as Response body)
// than the async ReactPDFStream API. Renders happen server-side in Node.
export async function renderCvPdf(cv: MasterCV | TailoredCV): Promise<Buffer> {
  const el = createElement(CvPdfDocument, { cv }) as unknown as PdfElement
  return renderToBuffer(el)
}

export async function renderCoverLetterPdf(
  letter: CoverLetter,
  sender?: CoverLetterSender,
): Promise<Buffer> {
  const el = createElement(CoverLetterPdfDocument, {
    letter,
    sender,
  }) as unknown as ReactElement as unknown as PdfElement
  return renderToBuffer(el)
}

export async function renderPrepPackPdf(
  pack: InterviewPrepPack,
  meta?: { jobTitle?: string; companyName?: string },
): Promise<Buffer> {
  const el = createElement(PrepPackPdfDocument, {
    pack,
    jobTitle: meta?.jobTitle,
    companyName: meta?.companyName,
  }) as unknown as ReactElement as unknown as PdfElement
  return renderToBuffer(el)
}

export async function renderDebriefPdf(
  debrief: InterviewDebrief,
  meta?: { stageKind?: string; jobTitle?: string; companyName?: string },
): Promise<Buffer> {
  const el = createElement(DebriefPdfDocument, {
    debrief,
    stageKind: meta?.stageKind,
    jobTitle: meta?.jobTitle,
    companyName: meta?.companyName,
  }) as unknown as ReactElement as unknown as PdfElement
  return renderToBuffer(el)
}
