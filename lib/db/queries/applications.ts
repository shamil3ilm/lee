import { and, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
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
  client: DbClient = db,
): Promise<Application> {
  const [row] = await client
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

/**
 * Job fields a list row needs (pipeline, table, CSV export, pickers). The
 * heavy text/jsonb columns — description_md, parsed_meta, benefits — are
 * only loaded by `getById` for the detail page and AI prompts.
 */
const LIST_JOB_COLUMNS = {
  id: true,
  companyId: true,
  title: true,
  sourceUrl: true,
  location: true,
  remoteType: true,
  employmentType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  postedAt: true,
} as const

type JobRow = (typeof import('@/lib/db/schema').jobs)['$inferSelect']

export type ApplicationListRow = Application & {
  job: Pick<JobRow, keyof typeof LIST_JOB_COLUMNS> & {
    company: { id: string; name: string } | null
  }
}

export async function list(
  userId: string,
  filters: { status?: ApplicationStatus } = {},
): Promise<ApplicationListRow[]> {
  const where = filters.status
    ? and(eq(applications.userId, userId), eq(applications.status, filters.status))
    : eq(applications.userId, userId)
  return db.query.applications.findMany({
    where,
    with: {
      job: {
        columns: LIST_JOB_COLUMNS,
        with: { company: { columns: { id: true, name: true } } },
      },
    },
    orderBy: (a, { desc }) => desc(a.updatedAt),
  })
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<
  | (Application & {
      job: (typeof import('@/lib/db/schema').jobs)['$inferSelect'] & {
        company: (typeof import('@/lib/db/schema').companies)['$inferSelect'] | null
      }
    })
  | undefined
> {
  const row = await client.query.applications.findFirst({
    where: and(eq(applications.userId, userId), eq(applications.id, id)),
    with: { job: { with: { company: true } } },
  })
  return row as never
}

export async function setNextAction(
  userId: string,
  id: string,
  when: Date | null,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(applications)
    .set({ nextActionAt: when, updatedAt: new Date() })
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
}

/**
 * Set the applied_at timestamp on an application and log an activity so the
 * change is auditable. Returns the updated row or undefined when the row
 * doesn't belong to this user.
 */
export async function setAppliedAt(
  userId: string,
  id: string,
  when: Date,
): Promise<Application | undefined> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.applications.findFirst({
      where: and(eq(applications.userId, userId), eq(applications.id, id)),
    })
    if (!existing) return undefined
    const [updated] = await tx
      .update(applications)
      .set({ appliedAt: when, updatedAt: new Date() })
      .where(and(eq(applications.userId, userId), eq(applications.id, id)))
      .returning()
    await tx.insert(activities).values({
      userId,
      applicationId: id,
      kind: 'applied_at_set',
      payload: {
        from: existing.appliedAt?.toISOString() ?? null,
        to: when.toISOString(),
      },
    })
    return updated
  })
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
