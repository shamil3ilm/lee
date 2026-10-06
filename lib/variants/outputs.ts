import * as documentsQ from '@/lib/db/queries/documents'
import type { Document } from '@/lib/db/queries/documents'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import { saveCvCopyToDrive, type CvCopyResult } from '@/lib/drive/cv-copy'
import { compileDocumentPdf } from '@/lib/latex/pdf-cache'
import { scoreCv, type CvScoreRecord } from '@/lib/cv-score/score'
import type { AIProvider } from '@/lib/ai/types'
import { variantToLatex } from './latex'
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

/** The LaTeX document for the variant's current version (created once, refreshed if the source drifted). */
export async function ensureVariantDocument(userId: string, variantId: string): Promise<Document> {
  const { variant, version, recipe, rendered } = await renderStored(userId, variantId)
  const title = variantDocTitle(variant.name, version)
  const source = variantToLatex(rendered, recipe.lengthTarget)
  const existing = (await documentsQ.list(userId, { kind: 'latex_cv' })).find((d) => d.title === title)
  if (existing) {
    const full = await documentsQ.getById(userId, existing.id)
    const content = latexDocumentContentSchema.safeParse(full?.content)
    if (content.success && content.data.source === source) return full!
    const updated = await documentsQ.update(userId, existing.id, { content: { source, templateId: `variant-${recipe.template}` } })
    if (updated) return updated
  }
  const next = await documentsQ.nextVersion(userId, null, 'latex_cv')
  return documentsQ.create(userId, {
    applicationId: null,
    kind: 'latex_cv',
    version: next,
    title,
    content: { source, templateId: `variant-${recipe.template}` },
  })
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
