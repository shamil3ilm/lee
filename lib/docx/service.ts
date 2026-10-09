import * as documentsQ from '@/lib/db/queries/documents'
import { masterCvSchema, tailoredCvSchema } from '@/lib/documents/types'
import { loadVariant, renderStored, VariantError } from '@/lib/variants/service'
import { paperFor } from '@/lib/variants/types'
import { buildCvDocx } from './build'
import { cvToDocxModel } from './from-cv'
import { variantToDocxModel } from './from-variant'
import type { DocxPaper } from './model'

/**
 * Server side of "Download .docx": the saved variant version, or a stored
 * master / tailored CV document, as Word bytes plus a download name. Loaded
 * lazily by the routes so the writer never reaches a page bundle.
 */

export class DocxExportError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 415 | 422,
  ) {
    super(message)
    this.name = 'DocxExportError'
  }
}

export interface DocxFile {
  filename: string
  bytes: Uint8Array
}

const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]+/g

function fileName(...parts: string[]): string {
  const base = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' - ')
    .replace(UNSAFE_NAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return `${base || 'CV'}.docx`
}

export async function variantDocx(userId: string, variantId: string): Promise<DocxFile> {
  try {
    const { variant, version, rendered } = await renderStored(userId, variantId)
    return { filename: fileName(rendered.name, `CV ${variant.name} v${version}`), bytes: buildCvDocx(variantToDocxModel(rendered)) }
  } catch (err) {
    if (err instanceof VariantError) throw new DocxExportError(err.message, 404)
    throw err
  }
}

/** A tailored CV keeps the paper of the variant it was tailored from; anything else is A4. */
async function paperOf(userId: string, meta: unknown): Promise<DocxPaper> {
  const m = (meta ?? {}) as { resumeVariantId?: unknown; resumeVariantVersion?: unknown }
  if (typeof m.resumeVariantId !== 'string') return 'a4'
  try {
    const version = typeof m.resumeVariantVersion === 'number' ? m.resumeVariantVersion : undefined
    return paperFor((await loadVariant(userId, m.resumeVariantId, version)).recipe)
  } catch {
    return 'a4'
  }
}

export async function documentDocx(userId: string, documentId: string): Promise<DocxFile> {
  const doc = await documentsQ.getById(userId, documentId)
  if (!doc) throw new DocxExportError('Not found.', 404)
  if (doc.kind !== 'master_cv' && doc.kind !== 'tailored_cv') {
    throw new DocxExportError('Only CV documents can be downloaded as Word.', 415)
  }
  const parsed = (doc.kind === 'tailored_cv' ? tailoredCvSchema : masterCvSchema).safeParse(doc.content)
  const cv = parsed.success ? parsed.data : masterCvSchema.safeParse(doc.content).data
  if (!cv) throw new DocxExportError('This CV document is malformed.', 422)
  const paper = await paperOf(userId, doc.aiGenerationMeta)
  return { filename: fileName(cv.basics.name, doc.title), bytes: buildCvDocx(cvToDocxModel(cv, paper)) }
}
