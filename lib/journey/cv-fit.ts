import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applications, companies, cvScores, jobs } from '@/lib/db/schema'
import { CV_FIT_TARGET } from '@/lib/cv-score/fit'

/**
 * v12 integration — the CV-fit dashboard signal. Kept out of service.ts so
 * the journey module stays small; service.ts wires it into the
 * next-best-action probes.
 */

export interface LowCvFit {
  applicationId: string
  overall: number
  jobTitle: string
  companyName: string | null
}

/**
 * The saved (not yet applied) application whose LATEST Total Match is the
 * lowest below CV_FIT_TARGET. DISTINCT ON keeps one row per application, so
 * an old low score that has since been improved never resurfaces.
 */
export async function findLowestCvFit(userId: string): Promise<LowCvFit | null> {
  const latest = await db
    .selectDistinctOn([cvScores.applicationId], {
      applicationId: applications.id,
      overall: cvScores.overall,
      jobTitle: jobs.title,
      companyName: companies.name,
    })
    .from(cvScores)
    .innerJoin(applications, eq(applications.id, cvScores.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(
      and(
        eq(cvScores.userId, userId),
        eq(cvScores.mode, 'jd'),
        eq(applications.userId, userId),
        eq(applications.status, 'saved'),
      ),
    )
    .orderBy(cvScores.applicationId, desc(cvScores.createdAt))

  // filter() returns a fresh array, so sorting it leaves `latest` untouched.
  const [lowest] = latest
    .filter((r) => r.overall < CV_FIT_TARGET)
    .sort((a, b) => a.overall - b.overall)
  return lowest ?? null
}
