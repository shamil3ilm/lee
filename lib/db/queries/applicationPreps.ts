import { and, asc, count, eq, gte, isNotNull, lte } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { applicationPreps, applications, companies, jobs } from '@/lib/db/schema'
import { parseProgress, type PrepProgress } from '@/lib/apply/progress'

export type PrepRow = typeof applicationPreps.$inferSelect
export type FollowupStatus = 'pending' | 'done' | 'cancelled'

export interface Prep extends Omit<PrepRow, 'progress'> {
  progress: PrepProgress
}

function toPrep(row: PrepRow): Prep {
  return { ...row, progress: parseProgress(row.progress) }
}

export async function get(userId: string, applicationId: string, client: DbClient = db): Promise<Prep | null> {
  const [row] = await client
    .select()
    .from(applicationPreps)
    .where(and(eq(applicationPreps.userId, userId), eq(applicationPreps.applicationId, applicationId)))
    .limit(1)
  return row ? toPrep(row) : null
}

/** Create the prep row if missing (idempotent) and return it. */
export async function ensure(userId: string, applicationId: string, client: DbClient = db): Promise<Prep> {
  await client.insert(applicationPreps).values({ userId, applicationId }).onConflictDoNothing({ target: applicationPreps.applicationId })
  const row = await get(userId, applicationId, client)
  if (!row) throw new Error('application prep not found')
  return row
}

export async function save(
  userId: string,
  applicationId: string,
  patch: Partial<Pick<PrepRow, 'preparedAt' | 'appliedAt' | 'followupDueAt' | 'followupStatus' | 'followupClosedAt'>> & {
    progress?: PrepProgress
  },
  client: DbClient = db,
): Promise<void> {
  await client
    .update(applicationPreps)
    .set({ ...patch, ...(patch.progress ? { progress: patch.progress as never } : {}), updatedAt: new Date() })
    .where(and(eq(applicationPreps.userId, userId), eq(applicationPreps.applicationId, applicationId)))
}

/** Close the pending follow-up of one application; returns rows changed. */
export async function closeFollowup(
  userId: string,
  applicationId: string,
  status: Exclude<FollowupStatus, 'pending'>,
  now: Date,
  client: DbClient = db,
): Promise<number> {
  const rows = await client
    .update(applicationPreps)
    .set({ followupStatus: status, followupClosedAt: now, updatedAt: now })
    .where(
      and(
        eq(applicationPreps.userId, userId),
        eq(applicationPreps.applicationId, applicationId),
        eq(applicationPreps.followupStatus, 'pending'),
      ),
    )
    .returning()
  return rows.length
}

export interface DueFollowup {
  applicationId: string
  dueAt: Date
  appliedAt: Date | null
  jobTitle: string
  companyName: string | null
  status: string
}

/** Pending follow-ups due by `until`, oldest first (bounded). */
export async function listDue(userId: string, until: Date, limit = 10, client: DbClient = db): Promise<DueFollowup[]> {
  const rows = await client
    .select({
      applicationId: applicationPreps.applicationId,
      dueAt: applicationPreps.followupDueAt,
      appliedAt: applicationPreps.appliedAt,
      jobTitle: jobs.title,
      companyName: companies.name,
      status: applications.status,
    })
    .from(applicationPreps)
    .innerJoin(
      applications,
      and(eq(applications.id, applicationPreps.applicationId), eq(applications.userId, applicationPreps.userId)),
    )
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(
      and(
        eq(applicationPreps.userId, userId),
        eq(applicationPreps.followupStatus, 'pending'),
        isNotNull(applicationPreps.followupDueAt),
        lte(applicationPreps.followupDueAt, until),
      ),
    )
    .orderBy(asc(applicationPreps.followupDueAt))
    .limit(limit)
  return rows.map((r) => ({ ...r, dueAt: r.dueAt as Date }))
}

/** Application ids with a pending follow-up (any due date). */
export async function pendingIds(userId: string, client: DbClient = db): Promise<Set<string>> {
  const rows = await client
    .select({ id: applicationPreps.applicationId })
    .from(applicationPreps)
    .where(and(eq(applicationPreps.userId, userId), eq(applicationPreps.followupStatus, 'pending')))
  return new Set(rows.map((r) => r.id))
}

export async function countPreparedSince(userId: string, since: Date, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ c: count() })
    .from(applicationPreps)
    .where(and(eq(applicationPreps.userId, userId), gte(applicationPreps.preparedAt, since)))
  return Number(row?.c ?? 0)
}
