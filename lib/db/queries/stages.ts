import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { interviewStages } from '@/lib/db/schema'

export type InterviewStage = typeof interviewStages.$inferSelect
export type NewInterviewStage = typeof interviewStages.$inferInsert

export async function create(
  userId: string,
  applicationId: string,
  data: Omit<NewInterviewStage, 'userId' | 'applicationId' | 'id' | 'createdAt' | 'updatedAt'>,
): Promise<InterviewStage> {
  const [row] = await db
    .insert(interviewStages)
    .values({ ...data, userId, applicationId })
    .returning()
  if (!row) throw new Error('failed to insert interview stage')
  return row
}

export async function list(userId: string, applicationId: string): Promise<InterviewStage[]> {
  return db.query.interviewStages.findMany({
    where: and(
      eq(interviewStages.userId, userId),
      eq(interviewStages.applicationId, applicationId),
    ),
    // nulls last so unscheduled stages appear after scheduled ones
    orderBy: sql`${interviewStages.scheduledAt} asc nulls last`,
  })
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<NewInterviewStage>,
): Promise<InterviewStage | undefined> {
  const [row] = await db
    .update(interviewStages)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(interviewStages.userId, userId), eq(interviewStages.id, id)))
    .returning()
  return row
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(interviewStages)
    .where(and(eq(interviewStages.userId, userId), eq(interviewStages.id, id)))
    .returning()
  return rows.length > 0
}
