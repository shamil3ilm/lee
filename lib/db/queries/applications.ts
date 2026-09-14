import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, applications } from '@/lib/db/schema'

export type Application = typeof applications.$inferSelect
export type NewApplication = typeof applications.$inferInsert
export type ApplicationStatus =
  | 'saved'
  | 'applied'
  | 'screen'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export async function create(
  userId: string,
  data: Omit<NewApplication, 'userId' | 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Application> {
  const [row] = await db
    .insert(applications)
    .values({ ...data, userId })
    .returning()
  if (!row) throw new Error('failed to insert application')
  return row
}

export async function updateStatus(
  userId: string,
  id: string,
  newStatus: ApplicationStatus,
): Promise<Application | undefined> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.applications.findFirst({
      where: and(eq(applications.userId, userId), eq(applications.id, id)),
    })
    if (!existing) return undefined
    const previous = existing.status
    if (previous === newStatus) return existing

    const patch: Partial<NewApplication> = { status: newStatus, updatedAt: new Date() }
    if (newStatus === 'applied' && !existing.appliedAt) {
      patch.appliedAt = new Date()
    }

    const [updated] = await tx
      .update(applications)
      .set(patch)
      .where(and(eq(applications.userId, userId), eq(applications.id, id)))
      .returning()

    await tx.insert(activities).values({
      userId,
      applicationId: id,
      kind: 'status_change',
      payload: { from: previous, to: newStatus },
    })

    return updated
  })
}

export type ApplicationWithJob = Application & {
  job: (typeof import('@/lib/db/schema').jobs)['$inferSelect'] & {
    company: (typeof import('@/lib/db/schema').companies)['$inferSelect'] | null
  }
}

export async function list(
  userId: string,
  filters: { status?: ApplicationStatus } = {},
): Promise<ApplicationWithJob[]> {
  const where = filters.status
    ? and(eq(applications.userId, userId), eq(applications.status, filters.status))
    : eq(applications.userId, userId)
  const rows = await db.query.applications.findMany({
    where,
    with: { job: { with: { company: true } } },
    orderBy: (a, { desc }) => desc(a.updatedAt),
  })
  return rows as never
}

export async function getById(
  userId: string,
  id: string,
): Promise<
  | (Application & {
      job: (typeof import('@/lib/db/schema').jobs)['$inferSelect'] & {
        company: (typeof import('@/lib/db/schema').companies)['$inferSelect'] | null
      }
    })
  | undefined
> {
  const row = await db.query.applications.findFirst({
    where: and(eq(applications.userId, userId), eq(applications.id, id)),
    with: { job: { with: { company: true } } },
  })
  return row as never
}

export async function setNextAction(
  userId: string,
  id: string,
  when: Date | null,
): Promise<void> {
  await db
    .update(applications)
    .set({ nextActionAt: when, updatedAt: new Date() })
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<NewApplication>,
): Promise<Application | undefined> {
  const [row] = await db
    .update(applications)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .returning()
  return row
}
