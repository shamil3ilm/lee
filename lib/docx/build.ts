import { strToU8, zipSync } from 'fflate'
import type { DocxPaper, DocxResume } from './model'
import { APP_PROPS, CONTENT_TYPES, coreProps, DOCUMENT_RELS, NUMBERING, PACKAGE_RELS, STYLES, W_NS, XML_HEAD, xmlEscape } from './parts'

/**
 * DocxResume → .docx bytes. A hand-written minimal OOXML package zipped with
 * fflate (already a dependency): no layout tables, no text boxes, no images,
 * one column, real Title / Heading 1 / Heading 2 / List Bullet styles, so
 * Taleo/ORC, Workday, SuccessFactors and Naukri parse it like a typed CV and
 * an agency can re-brand it in Word. Deterministic: same input, same bytes.
 */

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Page size in twentieths of a point. */
const PAGE: Readonly<Record<DocxPaper, { w: number; h: number }>> = {
  a4: { w: 11906, h: 16838 },
  letter: { w: 12240, h: 15840 },
}
/** 0.75 in on every side. */
const MARGIN = 1080
/** Fixed zip timestamp so the output is reproducible. */
const ZIP_MTIME = new Date('2026-01-01T00:00:00Z')

function run(text: string, rPr = ''): string {
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
}

/** List paragraphs repeat the numbering on the paragraph itself, as Word writes it. */
const LIST_PR = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'

function paragraph(text: string, styleId?: string): string {
  const numPr = styleId === 'ListBullet' ? LIST_PR : ''
  const pPr = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/>${numPr}</w:pPr>` : ''
  return `<w:p>${pPr}${run(text)}</w:p>`
}

/**
 * "Backend Engineer — PayFlow | Dubai | Apr 2021 – Present" on one Heading 2
 * line (title and employer bold, location and dates regular): parsers read
 * the role, employer and dates together, the way they read a typed CV.
 */
function entryHeading(heading: string, meta: string): string {
  const tail = meta ? run(` | ${meta}`, '<w:b w:val="0"/>') : ''
  return `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${run(heading)}${tail}</w:p>`
}

function body(r: DocxResume): string[] {
  const out: string[] = [paragraph(r.name, 'Title')]
  if (r.headline) out.push(paragraph(r.headline, 'Subtitle'))
  for (const line of r.contact) if (line) out.push(paragraph(line))
  for (const s of r.sections) {
    out.push(paragraph(s.heading, 'Heading1'))
    for (const text of s.paragraphs) if (text) out.push(paragraph(text))
    for (const e of s.entries) {
      out.push(entryHeading(e.heading, e.meta))
      if (e.detail) out.push(paragraph(e.detail))
      for (const b of e.bullets) if (b) out.push(paragraph(b, 'ListBullet'))
    }
  }
  return out
}

function documentXml(r: DocxResume): string {
  const { w, h } = PAGE[r.paper]
  const sect = `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="720"/></w:sectPr>`
  return `${XML_HEAD}<w:document xmlns:w="${W_NS}"><w:body>${body(r).join('')}${sect}</w:body></w:document>`
}

export function buildCvDocx(r: DocxResume): Uint8Array {
  const file = (xml: string): [Uint8Array, { mtime: Date }] => [strToU8(xml), { mtime: ZIP_MTIME }]
  return zipSync(
    {
      '[Content_Types].xml': file(CONTENT_TYPES),
      '_rels/.rels': file(PACKAGE_RELS),
      'docProps/app.xml': file(APP_PROPS),
      'docProps/core.xml': file(coreProps(`${r.name} — CV`, r.name)),
      'word/_rels/document.xml.rels': file(DOCUMENT_RELS),
      'word/document.xml': file(documentXml(r)),
      'word/numbering.xml': file(NUMBERING),
      'word/styles.xml': file(STYLES),
    },
    { level: 6 },
  )
}
