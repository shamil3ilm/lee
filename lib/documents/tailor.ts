import * as applicationsQ from '@/lib/db/queries/applications'
import * as documentsQ from '@/lib/db/queries/documents'
import { getMasterCV } from './master'
import { tailoredCvSchema } from './types'
import { ApplicationNotFoundError, MasterCVNotFoundError } from './errors'
import { snapshotForTailoredCV } from '@/lib/staleness/snapshot'
import { AISkippedError, checkTailorCVSignal } from '@/lib/ai/signal'
import { linkLatestCallToDocument, writeSkipLog } from '@/lib/ai/log'
import type { AIProvider } from '@/lib/ai/types'
import type { Document } from '@/lib/db/queries/documents'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'
import type { MasterCV } from './types'
import type { TailorVariantContext } from '@/lib/ai/prompts/tailor-cv'
import { renderStored, VariantError } from '@/lib/variants/service'
import { domainOnlyBullets, variantToMasterCv } from '@/lib/variants/export'
import { lockTailoredCv } from '@/lib/variants/tailor-lock'
import { logger } from '@/lib/logger'

/** The CV tailoring starts from: the application's variant version, or the master CV. */
export async function startingCv(
  userId: string,
  application: Pick<ApplicationWithJob, 'resumeVariantId' | 'resumeVariantVersion'>,
): Promise<{ cv: MasterCV; variant?: TailorVariantContext } | null> {
  if (application.resumeVariantId && application.resumeVariantVersion) {
    try {
      const { variant, version, rendered } = await renderStored(userId, application.resumeVariantId, application.resumeVariantVersion)
      return { cv: variantToMasterCv(rendered), variant: { name: variant.name, version, domainOnly: domainOnlyBullets(rendered) } }
    } catch (err) {
      if (!(err instanceof VariantError)) throw err
      logger.warn('tailor_variant_missing', { err: err.message })
    }
  }
  const cv = await getMasterCV(userId)
  return cv ? { cv } : null
}

/**
 * Generates a tailored CV for a specific application:
 * 1. loads the user's latest master CV
 * 2. loads the application (with job + company)
 * 3. calls ai.tailorCV, validates the response
 * 4. persists as a new `documents` row with kind='tailored_cv'
 *
 * The auto-generated title is "CV — <role> @ <company>" for the library view.
 */
export async function generateTailoredCV(input: {
  userId: string
  applicationId: string
  ai: AIProvider
}): Promise<Document> {
  const application = await applicationsQ.getById(input.userId, input.applicationId)
  if (!application) throw new ApplicationNotFoundError(input.applicationId)

  // Start from the résumé variant chosen for this application (the exact
  // version recorded on it), else from the derived master CV.
  const start = await startingCv(input.userId, application)
  if (!start) throw new MasterCVNotFoundError()
  const master = start.cv

  const signal = checkTailorCVSignal(application, master)
  if (!signal.ok) {
    await writeSkipLog(
      { userId: input.userId, provider: 'unknown', kind: 'tailored_cv' },
      signal.code,
    )
    throw new AISkippedError(signal.code, signal.message, signal.fixHint)
  }

  const tailored = await input.ai.tailorCV({ master, application, variant: start.variant })
  // Belt-and-braces: providers already validate, but a caller-supplied AI
  // could bypass. Re-parse here, then fact-lock it to the starting CV.
  const validated = lockTailoredCv(tailoredCvSchema.parse(tailored), master).cv

  const version = await documentsQ.nextVersion(input.userId, input.applicationId, 'tailored_cv')
  const company = application.job.company?.name ?? 'unknown'
  const title = `CV — ${application.job.title} @ ${company}`.slice(0, 200)

  // v9 — persist the state fingerprint so the check util can detect drift
  // (e.g. job.parsedMeta re-parsed, master CV bumped) after the fact.
  const stateSnapshot = snapshotForTailoredCV(
    {
      id: application.id,
      status: application.status,
      appliedAt: application.appliedAt,
      jobId: application.jobId,
      updatedAt: application.updatedAt,
      companyId: application.job.companyId ?? null,
      companyName: application.job.company?.name ?? null,
      jobTitle: application.job.title,
    },
    {
      id: application.job.id,
      title: application.job.title,
      descriptionMd: application.job.descriptionMd,
      parsedMeta: application.job.parsedMeta,
      benefits: application.job.benefits,
      updatedAt: application.job.updatedAt,
    },
    master,
  )

  const doc = await documentsQ.create(input.userId, {
    applicationId: input.applicationId,
    kind: 'tailored_cv',
    version,
    title,
    content: { ...validated, stateSnapshot },
    aiGenerationMeta: start.variant
      ? { resumeVariantId: application.resumeVariantId, resumeVariantVersion: start.variant.version }
      : {},
  })
  // v10 — thread the documentId back to the most recent ai_call_logs row
  // so rating buttons on the doc can find the underlying call. Best-effort.
  await linkLatestCallToDocument(input.userId, doc.id, 'tailored_cv')
  return doc
}
