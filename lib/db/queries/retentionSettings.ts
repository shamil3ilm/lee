import { eq, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { retentionSettings, users } from '@/lib/db/schema'
import { policyFrom, type RetentionPolicy } from '@/lib/db/retention/windows'
import type { RetentionCounts } from '@/lib/db/retention/steps'

/** Per-user retention windows and the latest cleanup run (Settings › Storage). */

export type RetentionTrigger = 'cron' | 'manual' | 'early'

export interface LastRetentionRun {
  at: Date
  trigger: RetentionTrigger
  counts: Partial<RetentionCounts>
}

export interface RetentionSettingsView {
  policy: RetentionPolicy
  lastRun: LastRetentionRun | null
}

function toCounts(raw: unknown): Partial<RetentionCounts> {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]),
    ),
  ) as Partial<RetentionCounts>
}

function toTrigger(v: string | null): RetentionTrigger {
  return v === 'manual' || v === 'early' ? v : 'cron'
}

export async function get(userId: string, client: DbClient = db): Promise<RetentionSettingsView> {
  const [row] = await client.select().from(retentionSettings).where(eq(retentionSettings.userId, userId)).limit(1)
  return {
    policy: policyFrom(row),
    lastRun: row?.lastRunAt
      ? { at: row.lastRunAt, trigger: toTrigger(row.lastRunTrigger), counts: toCounts(row.lastRunResult) }
      : null,
  }
}

/** Every user with their windows (defaults when they never saved any). */
export async function listPolicies(client: DbClient = db): Promise<{ userId: string; policy: RetentionPolicy }[]> {
  const rows = await client
    .select({ userId: users.id, settings: retentionSettings })
    .from(users)
    .leftJoin(retentionSettings, eq(retentionSettings.userId, users.id))
  return rows.map((r) => ({ userId: r.userId, policy: policyFrom(r.settings) }))
}

export async function savePolicy(
  userId: string,
  policy: RetentionPolicy,
  now: Date = new Date(),
  client: DbClient = db,
): Promise<void> {
  const values = { ...policy, updatedAt: now }
  await client
    .insert(retentionSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: retentionSettings.userId, set: values })
}

export async function recordLastRun(
  userId: string,
  trigger: RetentionTrigger,
  counts: RetentionCounts,
  at: Date,
  client: DbClient = db,
): Promise<void> {
  const values = { lastRunTrigger: trigger, lastRunAt: at, lastRunResult: counts }
  await client
    .insert(retentionSettings)
    .values({ userId, ...values, updatedAt: sql`now()` })
    .onConflictDoUpdate({ target: retentionSettings.userId, set: values })
}
