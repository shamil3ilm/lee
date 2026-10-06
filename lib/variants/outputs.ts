import * as documentsQ from '@/lib/db/queries/documents'
import type { Document } from '@/lib/db/queries/documents'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import { saveCvCopyToDrive, type CvCopyResult } from '@/lib/drive/cv-copy'
import { compileDocumentPdf } from '@/lib/latex/pdf-cache'
import { scoreCv, type CvScoreRecord } from '@/lib/cv-score/score'
import type { AIProvider } from '@/lib/ai/types'
import { variantToLatex } from './latex'
import { getProfilePhoto, syncVariantPhoto } from '@/lib/resume/photo-store'
import { renderStored, VariantError } from './service'

/**
 * Variant outputs, all through existing pipelines:
 *   PDF   — a `latex_cv` document per variant version (LaTeX editor, the
 *           /api/documents/[id]/pdf route and its compile cache);
 *   Drive — that PDF saved to lee/CVs with the existing Drive integration;
 *   Score — CV Score's public API on that document (no cv-score internals).
 */

export function variantDocTitle(name: string, version: number): string {
  return `Résumé — ${name} v${version}`.slice(0, 200)
}

/**
 * The LaTeX document for the variant's current version (created once,
 * refreshed if the source drifted). When the variant places the photo, the
 * document also carries a copy of the profile photo as an asset, so the
 * existing pipeline (compile tarball, PDF cache key, LaTeX editor) sees it.
 */
export async function ensureVariantDocument(userId: string, variantId: string): Promise<Document> {
  const photo = await getProfilePhoto(userId)
  const { variant, version, recipe, rendered } = await renderStored(userId, variantId, undefined, undefined, { hasPhoto: photo !== null })
  const placed = rendered.photo ? photo : null
  const title = variantDocTitle(variant.name, version)
  const source = variantToLatex(rendered, recipe.lengthTarget, placed?.filename ?? null)
  const doc = await upsertVariantDocument(userId, title, source, recipe.template)
  await syncVariantPhoto(userId, doc.id, placed)
  return doc
}

async function upsertVariantDocument(userId: string, title: string, source: string, template: string): Promise<Document> {
  const content = { source, templateId: `variant-${template}` }
  const existing = (await documentsQ.list(userId, { kind: 'latex_cv' })).find((d) => d.title === title)
  if (existing) {
    const full = await documentsQ.getById(userId, existing.id)
    const current = latexDocumentContentSchema.safeParse(full?.content)
    if (current.success && current.data.source === source) return full!
    const updated = await documentsQ.update(userId, existing.id, { content })
    if (updated) return updated
  }
  const next = await documentsQ.nextVersion(userId, null, 'latex_cv')
  return documentsQ.create(userId, { applicationId: null, kind: 'latex_cv', version: next, title, content })
}

export async function saveVariantPdfToDrive(userId: string, variantId: string): Promise<CvCopyResult> {
  const doc = await ensureVariantDocument(userId, variantId)
  const { source } = latexDocumentContentSchema.parse(doc.content)
  const compiled = await compileDocumentPdf({ userId, documentId: doc.id, source })
  if (!compiled.ok) throw new VariantError('The PDF did not compile. Open it in the LaTeX editor to see the log.')
  return saveCvCopyToDrive({ userId, scoreId: null, name: `${doc.title}.pdf`, mimeType: 'application/pdf', bytes: compiled.pdf })
}

export async function scoreVariant(
  userId: string,
  variantId: string,
  opts: { applicationId?: string | null; ai: AIProvider | null },
): Promise<CvScoreRecord> {
  const doc = await ensureVariantDocument(userId, variantId)
  return scoreCv({ userId, source: { documentId: doc.id }, applicationId: opts.applicationId ?? null, ai: opts.ai })
}
