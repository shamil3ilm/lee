import { sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { companyDiscoveries, discoveries } from '@/lib/db/schema'
import type { RegionActivity } from '@/lib/coverage/compute'

/**
 * Per-region activity for the coverage panel (lib/coverage): postings
 * first seen in the last `days` by status, companies in the Companies tab
 * and the sources that yielded the region in the last 30 days. Three
 * grouped scans over `region_ids` (ancestors are stored, so "kw" counts a
 * Salmiya posting). Counts only, never payloads.
 */

const YIELD_DAYS = 30

type Row = Record<string, unknown>

function rowsOf(res: unknown): Row[] {
  const list = (res as { rows?: unknown[] }).rows ?? (res as unknown[])
  return (Array.isArray(list) ? list : []) as Row[]
}

function idsArray(ids: readonly string[]): ReturnType<typeof sql> {
  return sql`array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::text[]`
}

export async function regionActivity(
  userId: string,
  regionIds: readonly string[],
  days = 7,
  now: Date = new Date(),
  client: DbClient = db,
): Promise<Map<string, RegionActivity>> {
  const out = new Map<string, RegionActivity>()
  if (regionIds.length === 0) return out
  for (const id of regionIds) out.set(id, { byStatus: {}, companies: 0, yieldingSources: 0 })
  const since = new Date(now.getTime() - days * 86_400_000)
  const yieldSince = new Date(now.getTime() - YIELD_DAYS * 86_400_000)
  const wanted = idsArray(regionIds)

  const [byStatus, companies, yielding] = await Promise.all([
    client.execute(sql`
      select r.id as id, d.status as status, count(*) as c
      from ${discoveries} d, unnest(d.region_ids) as r(id)
      where d.user_id = ${userId} and d.created_at >= ${since.toISOString()}::timestamptz and r.id = any(${wanted})
      group by r.id, d.status
    `),
    client.execute(sql`
      select r.id as id, count(*) as c
      from ${companyDiscoveries} cd, unnest(cd.region_ids) as r(id)
      where cd.user_id = ${userId} and cd.status <> 'dismissed' and r.id = any(${wanted})
      group by r.id
    `),
    client.execute(sql`
      select r.id as id, count(distinct d.source_id) as c
      from ${discoveries} d, unnest(d.region_ids) as r(id)
      where d.user_id = ${userId} and d.created_at >= ${yieldSince.toISOString()}::timestamptz and r.id = any(${wanted})
      group by r.id
    `),
  ])

  for (const row of rowsOf(byStatus)) {
    const a = out.get(String(row.id))
    if (a) out.set(String(row.id), { ...a, byStatus: { ...a.byStatus, [String(row.status)]: Number(row.c) } })
  }
  for (const row of rowsOf(companies)) {
    const a = out.get(String(row.id))
    if (a) out.set(String(row.id), { ...a, companies: Number(row.c) })
  }
  for (const row of rowsOf(yielding)) {
    const a = out.get(String(row.id))
    if (a) out.set(String(row.id), { ...a, yieldingSources: Number(row.c) })
  }
  return out
}
