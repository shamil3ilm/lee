import { PDFDocument } from 'pdf-lib'
import * as documentsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { renderCvPdf, renderCoverLetterPdf, renderPrepPackPdf } from '@/lib/pdf/render'
import {
  coverLetterSchema,
  interviewPrepPackSchema,
  latexDocumentContentSchema,
  masterCvSchema,
  tailoredCvSchema,
  type CoverLetter,
  type InterviewPrepPack,
  type MasterCV,
  type TailoredCV,
} from '@/lib/documents/types'
import { getMasterCV } from '@/lib/documents/master'
import { compileLatex } from '@/lib/latex/compile'
import { getAssetStore } from '@/lib/storage/asset-store'

export interface MergeSource {
  kind: 'document' | 'asset'
  id: string
}

export interface MergeOptions {
  userId: string
  sources: readonly MergeSource[]
}

/**
 * Load PDF bytes for a single source. Dispatches by document kind for
 * document sources, and by mime type for asset sources. Throws a
 * `MergeError` when the source cannot be turned into PDF pages so the
 * caller can list the problem alongside successful sources.
 */
export class MergeError extends Error {
  readonly source: MergeSource
  constructor(message: string, source: MergeSource) {
    super(message)
    this.name = 'MergeError'
    this.source = source
  }
}

// A4 in points (1pt = 1/72 inch). pdf-lib's coordinate system is bottom-left.
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

async function bytesForDocument(userId: string, id: string): Promise<Buffer> {
  const doc = await documentsQ.getById(userId, id)
  if (!doc) throw new MergeError('document not found', { kind: 'document', id })

  if (doc.kind === 'latex_cv' || doc.kind === 'latex_cover_letter') {
    const content = latexDocumentContentSchema.parse(doc.content)
    if (!content.source.trim()) {
      throw new MergeError('LaTeX source is empty', { kind: 'document', id })
    }
    // Asset bytes come from the store (Postgres or Drive), one batch.
    const store = getAssetStore()
    const assets = await assetsQ.list(userId, id)
    const refs = assets.map((a) => store.refForDocumentAsset(a))
    const bytes = await store.getMany(userId, refs)
    const result = await compileLatex({
      source: content.source,
      assets: assets.flatMap((a, i) => {
        const b = bytes.get(refs[i]!)
        return b ? [{ filename: a.filename, mimeType: a.mimeType, bytes: b }] : []
      }),
    })
    if (!result.ok) {
      throw new MergeError(`LaTeX compile failed (status ${result.status})`, {
        kind: 'document',
        id,
      })
    }
    return Buffer.from(result.pdf)
  }

  if (doc.kind === 'master_cv') {
    const cv: MasterCV = masterCvSchema.parse(doc.content)
    return renderCvPdf(cv)
  }
  if (doc.kind === 'tailored_cv') {
    const cv: TailoredCV = tailoredCvSchema.parse(doc.content)
    return renderCvPdf(cv)
  }
  if (doc.kind === 'cover_letter') {
    const letter: CoverLetter = coverLetterSchema.parse(doc.content)
    const master = await getMasterCV(userId)
    return renderCoverLetterPdf(
      letter,
      master ? { ...master.basics } : { name: letter.senderName },
    )
  }
  if (doc.kind === 'interview_prep_pack') {
    const pack: InterviewPrepPack = interviewPrepPackSchema.parse(doc.content)
    return renderPrepPackPdf(pack)
  }
  if (doc.kind === 'merged_pdf') {
    // Recursive merge — regenerate the referenced sources.
    const content = doc.content as { sourceRefs?: MergeSource[] }
    const refs = Array.isArray(content?.sourceRefs) ? content.sourceRefs : []
    return mergePdfs({ userId, sources: refs })
  }
  throw new MergeError(`kind ${doc.kind} is not a PDF-producing document`, {
    kind: 'document',
    id,
  })
}

async function pdfFromImageAsset(
  bytes: Buffer,
  mimeType: string,
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  let image
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    image = await pdf.embedJpg(bytes)
  } else if (mimeType === 'image/png') {
    image = await pdf.embedPng(bytes)
  } else {
    throw new Error(`unsupported image type ${mimeType}`)
  }
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT])
  // Fit the image inside a small margin, preserving aspect ratio.
  const margin = 36
  const maxW = A4_WIDTH - margin * 2
  const maxH = A4_HEIGHT - margin * 2
  const scale = Math.min(maxW / image.width, maxH / image.height, 1)
  const w = image.width * scale
  const h = image.height * scale
  page.drawImage(image, {
    x: (A4_WIDTH - w) / 2,
    y: (A4_HEIGHT - h) / 2,
    width: w,
    height: h,
  })
  return Buffer.from(await pdf.save())
}

async function bytesForAsset(userId: string, id: string): Promise<Buffer> {
  const asset = await assetsQ.getMetaById(userId, id)
  if (!asset) throw new MergeError('asset not found', { kind: 'asset', id })
  const isPdf = asset.mimeType === 'application/pdf'
  if (!isPdf && !asset.mimeType.startsWith('image/')) {
    throw new MergeError(
      `asset mime ${asset.mimeType} not supported (need pdf or image)`,
      { kind: 'asset', id },
    )
  }
  const store = getAssetStore()
  const bytes = await store.get(userId, store.refForDocumentAsset(asset))
  if (!bytes) throw new MergeError('asset not found', { kind: 'asset', id })
  if (isPdf) return bytes
  return pdfFromImageAsset(bytes, asset.mimeType)
}

/**
 * Merge multiple documents & assets into a single PDF buffer. Order is
 * preserved. Errors on individual sources are collected into the thrown
 * `Error.cause` array so partial failures don't silently drop pages —
 * callers should surface them.
 */
export async function mergePdfs(opts: MergeOptions): Promise<Buffer> {
  const { userId, sources } = opts
  if (sources.length === 0) {
    throw new Error('mergePdfs: at least one source is required')
  }
  const merged = await PDFDocument.create()
  const failures: MergeError[] = []
  for (const source of sources) {
    try {
      const bytes =
        source.kind === 'document'
          ? await bytesForDocument(userId, source.id)
          : await bytesForAsset(userId, source.id)
      // pdf-lib's `load` requires a Uint8Array-compatible input.
      const src = await PDFDocument.load(bytes, { updateMetadata: false })
      const copied = await merged.copyPages(src, src.getPageIndices())
      for (const page of copied) merged.addPage(page)
    } catch (err) {
      const failure =
        err instanceof MergeError
          ? err
          : new MergeError(
              err instanceof Error ? err.message : String(err),
              source,
            )
      failures.push(failure)
    }
  }
  if (merged.getPageCount() === 0) {
    const message =
      failures.length > 0
        ? `mergePdfs: no pages produced. Failures: ${failures.map((f) => f.message).join('; ')}`
        : 'mergePdfs: no pages produced'
    throw new Error(message)
  }
  merged.setProducer('Employ')
  merged.setCreator('Employ merge')
  const bytes = await merged.save()
  return Buffer.from(bytes)
}
