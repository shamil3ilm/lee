import { and, asc, between, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { applications, companies, interviewStages, jobs } from '@/lib/db/schema'
import type { UpcomingInterview } from '@/lib/academy/selector/types'

/** Scheduled interview stages in a window, with the company name (for plan reasons). */
export async function upcomingInterviews(
  userId: string,
  from: Date,
  to: Date,
  client: DbClient = db,
): Promise<UpcomingInterview[]> {
  const rows = await client
    .select({
      stageId: interviewStages.id,
      kind: interviewStages.kind,
      title: interviewStages.title,
      scheduledAt: interviewStages.scheduledAt,
      company: companies.name,
    })
    .from(interviewStages)
    .innerJoin(applications, eq(applications.id, interviewStages.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(
      and(
        eq(interviewStages.userId, userId),
        eq(interviewStages.status, 'scheduled'),
        between(interviewStages.scheduledAt, from, to),
      ),
    )
    .orderBy(asc(interviewStages.scheduledAt))
    .limit(10)
  return rows.flatMap((r) =>
    r.scheduledAt
      ? [{ stageId: r.stageId, kind: r.kind, title: r.title ?? '', company: r.company ?? '', scheduledAt: r.scheduledAt }]
      : [],
  )
}
