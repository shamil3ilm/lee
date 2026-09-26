import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, jobRiskAssessments, jobs } from '@/lib/db/schema'
import * as companiesQ from '@/lib/db/queries/companies'
import type { NewJob } from '@/lib/db/queries/jobs'
import type { NewApplication } from '@/lib/db/queries/applications'

/**
 * Edit / delete for an application and the job it points at. Every read and
 * write is scoped by `userId`; a foreign id behaves exactly like a missing one.
 */

export type JobPatch = Pick<
  Partial<NewJob>,
  | 'title'
  | 'sourceUrl'
  | 'companyId'
  | 'location'
  | 'remoteType'
  | 'employmentType'
  | 'salaryMin'
  | 'salaryMax'
  | 'salaryCurrency'
  | 'descriptionMd'
>

export type ApplicationPatch = Pick<Partial<NewApplication>, 'source' | 'interestLevel'>

export type UpdateDetailsResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'company_not_found' | 'duplicate_url' }

export async function updateApplicationDetails(
  userId: string,
  applicationId: string,
  jobPatch: JobPatch,
  appPatch: ApplicationPatch,
): Promise<UpdateDetailsResult> {
  const app = await db.query.applications.findFirst({
    columns: { id: true, jobId: true },
    where: and(eq(applications.userId, userId), eq(applications.id, applicationId)),
  })
  if (!app) return { ok: false, reason: 'not_found' }

  if (jobPatch.companyId) {
    const company = await companiesQ.getById(userId, jobPatch.companyId)
    if (!company) return { ok: false, reason: 'company_not_found' }
  }

  if (jobPatch.sourceUrl) {
    // (user_id, source_url) is unique — check first so the user gets a clear
    // message instead of a constraint error.
    const clash = await db.query.jobs.findFirst({
      columns: { id: true },
      where: and(
        eq(jobs.userId, userId),
        eq(jobs.sourceUrl, jobPatch.sourceUrl),
        ne(jobs.id, app.jobId),
      ),
    })
    if (clash) return { ok: false, reason: 'duplicate_url' }
  }

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(jobs)
      .set({ ...jobPatch, updatedAt: now })
      .where(and(eq(jobs.userId, userId), eq(jobs.id, app.jobId)))
    await tx
      .update(applications)
      .set({ ...appPatch, updatedAt: now })
      .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
  })
  return { ok: true }
}

/**
 * Delete an application. Stages, activities and contact links cascade with
 * it; documents, todos and CV scores are kept (their FK is set null). The job
 * row is removed too when no other application uses it, along with its Scam
 * Shield assessment, so the company page doesn't list an orphaned job.
 */
export async function deleteApplication(userId: string, applicationId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(applications)
      .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
      .returning()
    if (!deleted) return false

    const stillUsed = await tx.query.applications.findFirst({
      columns: { id: true },
      where: and(eq(applications.userId, userId), eq(applications.jobId, deleted.jobId)),
    })
    if (!stillUsed) {
      await tx.delete(jobs).where(and(eq(jobs.userId, userId), eq(jobs.id, deleted.jobId)))
      await tx
        .delete(jobRiskAssessments)
        .where(
          and(
            eq(jobRiskAssessments.userId, userId),
            eq(jobRiskAssessments.targetType, 'job'),
            eq(jobRiskAssessments.targetId, deleted.jobId),
          ),
        )
    }
    return true
  })
}
