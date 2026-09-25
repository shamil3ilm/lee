import { and, desc, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { cvScores } from '@/lib/db/schema'

/**
 * v12.0 — cv_scores query layer. Every query is scoped by userId; a row owned
 * by another user is indistinguishable from a missing one.
 */

export type CvScoreRow = typeof cvScores.$inferSelect
export type NewCvScoreRow = typeof cvScores.$inferInsert

const DEFAULT_LIMIT = 50

export async function create(
  userId: string,
  data: Omit<NewCvScoreRow, 'userId' | 'id' | 'createdAt'>,
  client: DbClient = db,
): Promise<CvScoreRow> {
  const [row] = await client
    .insert(cvScores)
    .values({ ...data, userId })
    .returning()
  if (!row) throw new Error('failed to insert cv_score')
  return row
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<CvScoreRow | null> {
  const [row] = await client
    .select()
    .from(cvScores)
    .where(and(eq(cvScores.userId, userId), eq(cvScores.id, id)))
    .limit(1)
  return row ?? null
}

export async function listByDocument(
  userId: string,
  documentId: string,
  limit = DEFAULT_LIMIT,
  client: DbClient = db,
): Promise<CvScoreRow[]> {
  return client
    .select()
    .from(cvScores)
    .where(and(eq(cvScores.userId, userId), eq(cvScores.documentId, documentId)))
    .orderBy(desc(cvScores.createdAt))
    .limit(limit)
}

export async function listByApplication(
  userId: string,
  applicationId: string,
  limit = DEFAULT_LIMIT,
  client: DbClient = db,
): Promise<CvScoreRow[]> {
  return client
    .select()
    .from(cvScores)
    .where(and(eq(cvScores.userId, userId), eq(cvScores.applicationId, applicationId)))
    .orderBy(desc(cvScores.createdAt))
    .limit(limit)
}

export async function latestForApplication(
  userId: string,
  applicationId: string,
  client: DbClient = db,
): Promise<CvScoreRow | null> {
  const [row] = await listByApplication(userId, applicationId, 1, client)
  return row ?? null
}

/**
 * Score history for a document and/or application, oldest first (chart
 * order). With both filters the series is "this CV against this job".
 */
export async function history(
  userId: string,
  filter: { documentId?: string; applicationId?: string },
  limit = DEFAULT_LIMIT,
  client: DbClient = db,
): Promise<CvScoreRow[]> {
  const where = [eq(cvScores.userId, userId)]
  if (filter.documentId) where.push(eq(cvScores.documentId, filter.documentId))
  if (filter.applicationId) where.push(eq(cvScores.applicationId, filter.applicationId))
  const rows = await client
    .select()
    .from(cvScores)
    .where(and(...where))
    .orderBy(desc(cvScores.createdAt))
    .limit(limit)
  return [...rows].reverse()
}
