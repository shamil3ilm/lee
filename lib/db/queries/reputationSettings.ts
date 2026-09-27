import { eq, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { reputationSettings } from '@/lib/db/schema'

/**
 * Per-user reputation settings: the optional Google Places lookup (off by
 * default) and its monthly call budget.
 */

export interface ReputationSettings {
  placesEnabled: boolean
  placesMonthlyCap: number
  placesMonth: string | null
  placesCalls: number
}

export const DEFAULT_SETTINGS: ReputationSettings = {
  placesEnabled: false,
  placesMonthlyCap: 100,
  placesMonth: null,
  placesCalls: 0,
}

export async function get(userId: string, client: DbClient = db): Promise<ReputationSettings> {
  const [row] = await client.select().from(reputationSettings).where(eq(reputationSettings.userId, userId)).limit(1)
  if (!row) return DEFAULT_SETTINGS
  return {
    placesEnabled: row.placesEnabled,
    placesMonthlyCap: row.placesMonthlyCap,
    placesMonth: row.placesMonth,
    placesCalls: row.placesCalls,
  }
}

export async function savePlaces(
  userId: string,
  patch: { placesEnabled?: boolean; placesMonthlyCap?: number },
  client: DbClient = db,
): Promise<void> {
  const now = new Date()
  await client
    .insert(reputationSettings)
    .values({ userId, ...patch, updatedAt: now })
    .onConflictDoUpdate({ target: reputationSettings.userId, set: { ...patch, updatedAt: now } })
}

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

/**
 * Atomically reserve one Places call for `month` (yyyy-mm) under
 * min(user cap, hard cap). A new month restarts the counter. Returns the
 * calls used after the reservation, or null when Places is disabled or the
 * budget is spent — in which case nothing may be sent.
 */
export async function reservePlacesCall(
  userId: string,
  month: string,
  hardCap: number,
  client: DbClient = db,
): Promise<number | null> {
  const result = await client.execute(sql`
    update reputation_settings
    set places_calls = case when places_month = ${month} then places_calls + 1 else 1 end,
        places_month = ${month},
        updated_at = now()
    where user_id = ${userId}::uuid
      and places_enabled
      and least(places_monthly_cap, ${hardCap}) > 0
      and (places_month is distinct from ${month}
           or places_calls < least(places_monthly_cap, ${hardCap}))
    returning places_calls
  `)
  const [row] = toRows<{ places_calls: number | string }>(result)
  return row ? Number(row.places_calls) : null
}
