import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { jobs } from '@/lib/db/schema'

export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert

export async function upsertBySourceUrl(
  userId: string,
  companyId: string | null,
  data: Omit<NewJob, 'userId' | 'companyId' | 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Job> {
  const [row] = await db
    .insert(jobs)
    .values({ ...data, userId, companyId: companyId ?? undefined })
    .onConflictDoUpdate({
      target: [jobs.userId, jobs.sourceUrl],
      set: {
        title: data.title,
        location: data.location,
        remoteType: data.remoteType,
        employmentType: data.employmentType,
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        salaryCurrency: data.salaryCurrency,
        descriptionMd: data.descriptionMd,
        parsedMeta: data.parsedMeta,
        benefits: data.benefits,
        postedAt: data.postedAt,
        companyId: companyId ?? undefined,
        updatedAt: new Date(),
      },
    })
    .returning()
  if (!row) throw new Error('failed to upsert job')
  return row
}

export async function getById(userId: string, id: string): Promise<Job | undefined> {
  return db.query.jobs.findFirst({
    where: and(eq(jobs.userId, userId), eq(jobs.id, id)),
  })
}

export async function list(userId: string): Promise<Job[]> {
  return db.query.jobs.findMany({
    where: eq(jobs.userId, userId),
    orderBy: (j, { desc }) => desc(j.createdAt),
  })
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<NewJob>,
): Promise<Job | undefined> {
  const [row] = await db
    .update(jobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(jobs.userId, userId), eq(jobs.id, id)))
    .returning()
  return row
}
