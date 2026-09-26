import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { documentPdfCache } from '@/lib/db/schema'

/**
 * Compiled LaTeX PDF cache — at most one row per document (PK document_id).
 * Only the Postgres asset store should call these; routes go through
 * lib/storage.
 */

/** Cached bytes for (user, document) if they were compiled under `cacheKey`. */
export async function getBytes(
  userId: string,
  documentId: string,
  cacheKey: string,
  client: DbClient = db,
): Promise<Buffer | null> {
  const [row] = await client
    .select({ bytes: documentPdfCache.bytes })
    .from(documentPdfCache)
    .where(
      and(
        eq(documentPdfCache.userId, userId),
        eq(documentPdfCache.documentId, documentId),
        eq(documentPdfCache.cacheKey, cacheKey),
      ),
    )
    .limit(1)
  return row?.bytes ?? null
}

/** Insert or replace the document's single cache entry. */
export async function upsert(
  userId: string,
  documentId: string,
  cacheKey: string,
  bytes: Buffer,
  client: DbClient = db,
): Promise<void> {
  // driveFileId is cleared: the Postgres copy is now the cache entry.
  const values = { cacheKey, sizeBytes: bytes.byteLength, bytes, driveFileId: null, createdAt: new Date() }
  await client
    .insert(documentPdfCache)
    .values({ userId, documentId, ...values })
    .onConflictDoUpdate({
      target: documentPdfCache.documentId,
      set: values,
      // Never let one user overwrite another's row via a foreign document id.
      setWhere: eq(documentPdfCache.userId, userId),
    })
}

export interface PdfCacheEntry {
  cacheKey: string
  bytes: Buffer | null
  driveFileId: string | null
}

/** The document's single cache row (any key), scoped to the user. */
export async function getEntry(
  userId: string,
  documentId: string,
  client: DbClient = db,
): Promise<PdfCacheEntry | null> {
  const [row] = await client
    .select({
      cacheKey: documentPdfCache.cacheKey,
      bytes: documentPdfCache.bytes,
      driveFileId: documentPdfCache.driveFileId,
    })
    .from(documentPdfCache)
    .where(and(eq(documentPdfCache.userId, userId), eq(documentPdfCache.documentId, documentId)))
    .limit(1)
  return row ?? null
}

/** Record a cache entry whose bytes live in Drive (lee/PDFs). */
export async function upsertDrive(
  userId: string,
  documentId: string,
  cacheKey: string,
  sizeBytes: number,
  driveFileId: string,
  client: DbClient = db,
): Promise<void> {
  const values = { cacheKey, sizeBytes, bytes: null, driveFileId, createdAt: new Date() }
  await client
    .insert(documentPdfCache)
    .values({ userId, documentId, ...values })
    .onConflictDoUpdate({
      target: documentPdfCache.documentId,
      set: values,
      setWhere: eq(documentPdfCache.userId, userId),
    })
}

export async function remove(
  userId: string,
  documentId: string,
  cacheKey: string | null,
  client: DbClient = db,
): Promise<boolean> {
  const conds = [eq(documentPdfCache.userId, userId), eq(documentPdfCache.documentId, documentId)]
  if (cacheKey !== null) conds.push(eq(documentPdfCache.cacheKey, cacheKey))
  const res = await client.execute(
    sql`delete from ${documentPdfCache} where ${and(...conds)}`,
  )
  const r = res as { count?: number; affectedRows?: number }
  return Number(r.count ?? r.affectedRows ?? 0) > 0
}

export async function totalBytes(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ n: sql<string | number>`coalesce(sum(${documentPdfCache.sizeBytes}), 0)` })
    .from(documentPdfCache)
    .where(and(eq(documentPdfCache.userId, userId), isNotNull(documentPdfCache.bytes)))
  return Number(row?.n ?? 0)
}
