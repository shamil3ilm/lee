import { and, count, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { applications, companies, contacts, jobs } from '@/lib/db/schema'

export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert

export interface CompanyDetail {
  company: Company
  applications: Array<{
    id: string
    status: string
    appliedAt: Date | null
    jobTitle: string
  }>
  jobs: Array<{
    id: string
    title: string
    sourceUrl: string
    createdAt: Date
    hasApplication: boolean
  }>
  contacts: Array<{
    id: string
    name: string
    email: string | null
    role: string | null
  }>
}

/**
 * Atomic upsert: try to INSERT the (userId, domain) row; if the unique
 * constraint blocks it, fall back to reading the pre-existing row. Eliminates
 * the read-then-insert race in the previous implementation.
 */
export async function findOrCreateByDomain(
  userId: string,
  domain: string,
  name: string,
  client: DbClient = db,
): Promise<Company> {
  const [inserted] = await client
    .insert(companies)
    .values({ userId, domain, name })
    .onConflictDoNothing({ target: [companies.userId, companies.domain] })
    .returning()
  if (inserted) return inserted
  const existing = await client.query.companies.findFirst({
    where: and(eq(companies.userId, userId), eq(companies.domain, domain)),
  })
  if (!existing) throw new Error('findOrCreateByDomain: could not create or find')
  return existing
}

export async function listWatched(userId: string, client: DbClient = db): Promise<Company[]> {
  return client.query.companies.findMany({
    where: and(eq(companies.userId, userId), eq(companies.isWatched, true)),
    orderBy: (c, { asc }) => asc(c.name),
  })
}

/** id + name of every company the user has (watched or not), for labels. */
export async function listNames(
  userId: string,
  client: DbClient = db,
): Promise<Array<{ id: string; name: string }>> {
  return client
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.userId, userId))
}

export async function setWatched(
  userId: string,
  id: string,
  isWatched: boolean,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(companies)
    .set({ isWatched, updatedAt: new Date() })
    .where(and(eq(companies.userId, userId), eq(companies.id, id)))
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Company | undefined> {
  return client.query.companies.findFirst({
    where: and(eq(companies.userId, userId), eq(companies.id, id)),
  })
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<NewCompany>,
  client: DbClient = db,
): Promise<Company | undefined> {
  const [updated] = await client
    .update(companies)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(companies.userId, userId), eq(companies.id, id)))
    .returning()
  return updated
}

/** How many of the user's applications point at a job of this company. */
export async function countApplications(
  userId: string,
  companyId: string,
  client: DbClient = db,
): Promise<number> {
  const [row] = await client
    .select({ n: count() })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(and(eq(applications.userId, userId), eq(jobs.userId, userId), eq(jobs.companyId, companyId)))
  return Number(row?.n ?? 0)
}

export async function remove(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<boolean> {
  const rows = await client
    .delete(companies)
    .where(and(eq(companies.userId, userId), eq(companies.id, id)))
    .returning()
  return rows.length > 0
}

/**
 * Company detail bundle: the company row plus all applications tied to any
 * of its jobs, all jobs (with a flag for which have been applied to), and
 * all linked contacts. Kept as three simple scoped queries rather than one
 * with-relations blob so the shape is easy to consume and each collection
 * can be independently paginated later.
 */
export async function getWithApplicationsAndContacts(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<CompanyDetail | undefined> {
  const company = await client.query.companies.findFirst({
    where: and(eq(companies.userId, userId), eq(companies.id, id)),
  })
  if (!company) return undefined

  const jobRows = await client.query.jobs.findMany({
    where: and(eq(jobs.userId, userId), eq(jobs.companyId, id)),
    orderBy: (j, { desc }) => desc(j.createdAt),
    with: { applications: true },
  })

  const applicationRows: CompanyDetail['applications'] = []
  for (const j of jobRows) {
    for (const a of j.applications) {
      applicationRows.push({
        id: a.id,
        status: a.status,
        appliedAt: a.appliedAt,
        jobTitle: j.title,
      })
    }
  }

  const contactRows = await client.query.contacts.findMany({
    where: and(eq(contacts.userId, userId), eq(contacts.companyId, id)),
    orderBy: (c, { asc }) => asc(c.name),
    columns: { id: true, name: true, email: true, role: true },
  })

  const jobsProjection: CompanyDetail['jobs'] = jobRows.map((j) => ({
    id: j.id,
    title: j.title,
    sourceUrl: j.sourceUrl,
    createdAt: j.createdAt,
    hasApplication: j.applications.length > 0,
  }))

  // Sort applications: most recently applied first, unapplied (null) last.
  applicationRows.sort((a, b) => {
    if (a.appliedAt && b.appliedAt) return b.appliedAt.getTime() - a.appliedAt.getTime()
    if (a.appliedAt) return -1
    if (b.appliedAt) return 1
    return 0
  })

  return { company, applications: applicationRows, jobs: jobsProjection, contacts: contactRows }
}
