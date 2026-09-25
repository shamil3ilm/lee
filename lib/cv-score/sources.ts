/**
 * v12.0 — load a stored document as a CV source for scoring.
 */
import * as documentsQ from '@/lib/db/queries/documents'
import {
  latexDocumentContentSchema,
  masterCvSchema,
  tailoredCvSchema,
  type MasterCV,
} from '@/lib/documents/types'
import { CvScoreError } from './errors'
import type { CvSourceInput } from './extract'
import type { CvSourceKind } from './types'

export const SCORABLE_KINDS = ['master_cv', 'tailored_cv', 'latex_cv'] as const

export interface LoadedSource {
  input: CvSourceInput
  kind: CvSourceKind
  documentId: string | null
  label: string
  /** Present for master CV sources — used by autofix. */
  master?: MasterCV
  version?: number
}

export async function loadDocumentSource(userId: string, documentId: string): Promise<LoadedSource> {
  const doc = await documentsQ.getById(userId, documentId)
  if (!doc) throw new CvScoreError('document_not_found', 'Document not found.', 404)
  const label = doc.title
  if (doc.kind === 'master_cv') {
    const parsed = masterCvSchema.safeParse(doc.content)
    if (!parsed.success) throw new CvScoreError('invalid_document', 'This CV document is malformed.', 422)
    return {
      input: { kind: 'master_cv', cv: parsed.data },
      kind: 'master_cv',
      documentId: doc.id,
      label,
      master: parsed.data,
      version: doc.version,
    }
  }
  if (doc.kind === 'tailored_cv') {
    const parsed = tailoredCvSchema.safeParse(doc.content)
    const fallback = parsed.success ? null : masterCvSchema.safeParse(doc.content)
    const cv = parsed.success ? parsed.data : fallback?.success ? fallback.data : null
    if (!cv) throw new CvScoreError('invalid_document', 'This CV document is malformed.', 422)
    return { input: { kind: 'tailored_cv', cv }, kind: 'tailored_cv', documentId: doc.id, label, version: doc.version }
  }
  if (doc.kind === 'latex_cv') {
    const parsed = latexDocumentContentSchema.safeParse(doc.content)
    if (!parsed.success || !parsed.data.source.trim()) {
      throw new CvScoreError('invalid_document', 'This LaTeX CV has no source to score.', 422)
    }
    return { input: { kind: 'latex_cv', source: parsed.data.source }, kind: 'latex_cv', documentId: doc.id, label, version: doc.version }
  }
  throw new CvScoreError('unsupported_document', 'Only CV documents (master, tailored or LaTeX) can be scored.', 400)
}
