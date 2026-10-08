import { and, eq, inArray, max } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries } from '@/lib/db/schema'

/**
 * When each polled employer source last produced a posting: one grouped
 * read on (user_id, source_id), no payload columns.
 */
export async function lastSeenBySource(userId: string, sourceIds: readonly string[]): Promise<Map<string, Date>> {
  if (sourceIds.length === 0) return new Map()
  const rows = await db
    .select({ sourceId: discoveries.sourceId, at: max(discoveries.createdAt) })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inArray(discoveries.sourceId, [...sourceIds])))
    .groupBy(discoveries.sourceId)
  const out = new Map<string, Date>()
  for (const r of rows) if (r.at) out.set(r.sourceId, new Date(r.at))
  return out
}
