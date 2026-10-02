import { and, count, desc, eq, lt, max, sql, sum } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { emailAlertMessages } from '@/lib/db/schema'

/**
 * Job-alert emails the `email_alert` source has read — counters only, for
 * Settings › Sources. Every function is userId-scoped.
 */

export interface AlertMessageRow {
  messageId: string
  site: string
  receivedAt: Date
  jobsFound: number
}

/** Upsert one row per message (re-reading a message updates its count). */
export async function record(
  userId: string,
  rows: readonly AlertMessageRow[],
  client: DbClient = db,
): Promise<void> {
  if (rows.length === 0) return
  await client
    .insert(emailAlertMessages)
    .values(rows.map((r) => ({ userId, ...r })))
    .onConflictDoUpdate({
      target: [emailAlertMessages.userId, emailAlertMessages.messageId],
      set: { jobsFound: sql`excluded.jobs_found`, site: sql`excluded.site`, processedAt: sql`now()` },
    })
}

export interface AlertSiteSummary {
  site: string
  alerts: number
  jobsFound: number
  lastAlertAt: Date | null
}

/** Per site: alerts read, jobs extracted, newest alert. */
export async function summaryBySite(userId: string, client: DbClient = db): Promise<AlertSiteSummary[]> {
  const rows = await client
    .select({
      site: emailAlertMessages.site,
      alerts: count(),
      jobsFound: sum(emailAlertMessages.jobsFound),
      lastAlertAt: max(emailAlertMessages.receivedAt),
    })
    .from(emailAlertMessages)
    .where(eq(emailAlertMessages.userId, userId))
    .groupBy(emailAlertMessages.site)
    .orderBy(desc(max(emailAlertMessages.receivedAt)))
  return rows.map((r) => ({
    site: r.site,
    alerts: Number(r.alerts),
    jobsFound: Number(r.jobsFound ?? 0),
    lastAlertAt: r.lastAlertAt ? new Date(r.lastAlertAt as unknown as string) : null,
  }))
}

/** Drop counters for alerts older than `before` (they're only for display). */
export async function pruneOlderThan(userId: string, before: Date, client: DbClient = db): Promise<void> {
  await client
    .delete(emailAlertMessages)
    .where(and(eq(emailAlertMessages.userId, userId), lt(emailAlertMessages.receivedAt, before)))
}
