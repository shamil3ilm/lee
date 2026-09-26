import { inArray } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { scamDomainCache } from '@/lib/db/schema'

/** v17 §1 — per-domain network facts (public data, shared across users). */

export type DomainCacheRow = typeof scamDomainCache.$inferSelect
export type DomainCacheWrite = Omit<typeof scamDomainCache.$inferInsert, 'updatedAt'>

export async function getMany(
  domains: readonly string[],
  client: DbClient = db,
): Promise<Map<string, DomainCacheRow>> {
  if (domains.length === 0) return new Map()
  const rows = await client
    .select()
    .from(scamDomainCache)
    .where(inArray(scamDomainCache.domain, [...domains]))
  return new Map(rows.map((r) => [r.domain, r]))
}

export async function upsert(row: DomainCacheWrite, client: DbClient = db): Promise<void> {
  const { domain: _domain, ...rest } = row
  await client
    .insert(scamDomainCache)
    .values({ ...row, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: scamDomainCache.domain,
      set: { ...rest, updatedAt: new Date() },
    })
}
