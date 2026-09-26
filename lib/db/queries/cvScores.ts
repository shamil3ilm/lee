import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { cvScores } from '@/lib/db/schema'
import type * as schema from '@/lib/db/schema'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

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

/** The slim per-document view the documents library badges need. */
export interface CvScoreSummary {
  documentId: string
  overall: number
  grade: string
  mode: string
  createdAt: Date
}

/**
 * Latest score per document in ONE query (DISTINCT ON), so list pages can
 * badge every CV row without an N+1. Documents never scored are absent.
 */
export async function latestByDocuments(
  userId: string,
  documentIds: readonly string[],
  client: DbClient = db,
): Promise<CvScoreSummary[]> {
  if (documentIds.length === 0) return []
  const rows = await client
    .selectDistinctOn([cvScores.documentId], {
      documentId: cvScores.documentId,
      overall: cvScores.overall,
      grade: cvScores.grade,
      mode: cvScores.mode,
      createdAt: cvScores.createdAt,
    })
    .from(cvScores)
    .where(and(eq(cvScores.userId, userId), inArray(cvScores.documentId, [...documentIds])))
    .orderBy(cvScores.documentId, desc(cvScores.createdAt))
  return rows.flatMap((r) => (r.documentId ? [{ ...r, documentId: r.documentId }] : []))
}

/** True once the user has scored any CV at all. */
export async function hasAny(userId: string, client: DbClient = db): Promise<boolean> {
  const rows = await client
    .select({ id: cvScores.id })
    .from(cvScores)
    .where(eq(cvScores.userId, userId))
    .limit(1)
  return rows.length > 0
}

/** Link a score to the copy of its uploaded CV saved in Drive (A2). */
export async function setDriveFile(
  userId: string,
  id: string,
  driveFileId: string,
  client: DbClient = db,
): Promise<boolean> {
  // Narrowed like documentAssets.ts: both drivers support partial returning.
  const rows = await (client as unknown as PostgresJsDatabase<typeof schema>)
    .update(cvScores)
    .set({ driveFileId })
    .where(and(eq(cvScores.userId, userId), eq(cvScores.id, id)))
    .returning({ id: cvScores.id })
  return rows.length > 0
}
