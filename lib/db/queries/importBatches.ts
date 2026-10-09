import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { profileImportBatches } from '@/lib/db/schema'

/** Import provenance batches (lib/import). Every function is userId-scoped. */

export type ImportBatchRow = typeof profileImportBatches.$inferSelect

export async function create(
  userId: string,
  input: { source: string; mode: 'saved' | 'suggested'; importedAt: Date; counts: Record<string, number>; intentions: unknown; changes: unknown },
): Promise<ImportBatchRow> {
  const [row] = await db.insert(profileImportBatches).values({ userId, ...input }).returning()
  if (!row) throw new Error('profile_import_batches insert returned no row')
  return row
}

export async function getById(userId: string, id: string): Promise<ImportBatchRow | null> {
  const [row] = await db
    .select()
    .from(profileImportBatches)
    .where(and(eq(profileImportBatches.userId, userId), eq(profileImportBatches.id, id)))
    .limit(1)
  return row ?? null
}

/** Batches not undone yet, newest first. */
export async function listActive(userId: string, limit = 20, since?: Date): Promise<ImportBatchRow[]> {
  const filters = [eq(profileImportBatches.userId, userId), isNull(profileImportBatches.undoneAt)]
  if (since) filters.push(gte(profileImportBatches.importedAt, since))
  return db.select().from(profileImportBatches).where(and(...filters)).orderBy(desc(profileImportBatches.importedAt)).limit(limit)
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<Pick<ImportBatchRow, 'counts' | 'intentions' | 'changes' | 'undoneAt'>>,
): Promise<void> {
  await db
    .update(profileImportBatches)
    .set(patch)
    .where(and(eq(profileImportBatches.userId, userId), eq(profileImportBatches.id, id)))
}
