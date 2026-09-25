import * as applicationsQ from '@/lib/db/queries/applications'
import * as documentsQ from '@/lib/db/queries/documents'
import { getMasterCV } from './master'
import { tailoredCvSchema } from './types'
import { ApplicationNotFoundError, MasterCVNotFoundError } from './errors'
import { snapshotForTailoredCV } from '@/lib/staleness/snapshot'
import type { AIProvider } from '@/lib/ai/types'
import type { Document } from '@/lib/db/queries/documents'

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
  const master = await getMasterCV(input.userId)
  if (!master) throw new MasterCVNotFoundError()

  const application = await applicationsQ.getById(input.userId, input.applicationId)
  if (!application) throw new ApplicationNotFoundError(input.applicationId)

  const tailored = await input.ai.tailorCV({ master, application })
  // Belt-and-braces: providers already validate, but a caller-supplied AI
  // could bypass. Re-parse here.
  const validated = tailoredCvSchema.parse(tailored)

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

  return documentsQ.create(input.userId, {
    applicationId: input.applicationId,
    kind: 'tailored_cv',
    version,
    title,
    content: { ...validated, stateSnapshot },
  })
}
