import { desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { labProviderKeys, usageSettings, usageSnapshots } from '@/lib/db/schema'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import { runRetention } from '@/lib/db/retention'
import { logger } from '@/lib/logger'
import { recordUsageAlerts } from './alerts'
import { buildGlobalReadings, buildUserReadings, collectMeasurements } from './collect'
import { fetchNeonUsage, neonErrorMessage, type NeonUsage } from './neon-api'
import { parseSnapshotData, type UsageSnapshotData } from './snapshot-data'
import { clearThrottleCache, evaluateThrottles, type ThrottleId } from './throttle'

/**
 * SERVER-ONLY. The daily usage snapshot (job `usage-snapshot:all`, also the
 * throttled "Refresh now"): measure our own database, ask the Neon API when
 * a key is configured, store one row per UTC day, apply the throttles, and
 * record 70 % / 90 % warnings. Vendor calls happen only here.
 */

export interface NeonCredentials {
  key: string
  projectId: string | null
}

/**
 * The Neon key the snapshot uses. Usage meters are deployment-wide (one
 * Neon project), so the most recently saved `neon` key wins, with that
 * owner's project id; else the NEON_API_KEY env default with any saved
 * project id. Null when neither exists.
 */
export async function resolveNeonCredentials(): Promise<NeonCredentials | null> {
  const [owner] = await db
    .select({ userId: labProviderKeys.userId })
    .from(labProviderKeys)
    .where(eq(labProviderKeys.provider, 'neon'))
    .orderBy(desc(labProviderKeys.updatedAt))
    .limit(1)
  if (owner) {
    const key = await keysQ.getDecrypted(owner.userId, 'neon')
    if (key) {
      const [s] = await db
        .select({ projectId: usageSettings.neonProjectId })
        .from(usageSettings)
        .where(eq(usageSettings.userId, owner.userId))
        .limit(1)
      return { key, projectId: s?.projectId ?? null }
    }
  }
  const envKey = process.env.NEON_API_KEY
  if (!envKey) return null
  const [s] = await db
    .select({ projectId: usageSettings.neonProjectId })
    .from(usageSettings)
    .where(isNotNull(usageSettings.neonProjectId))
    .orderBy(desc(usageSettings.updatedAt))
    .limit(1)
  return { key: envKey, projectId: s?.projectId ?? null }
}

export interface SnapshotResult {
  day: string
  throttles: ThrottleId[]
  todosCreated: number
  retentionRan: boolean
  neonConnected: boolean
}

async function readNeon(): Promise<{ usage: NeonUsage | null; error: string | null; configured: boolean }> {
  const creds = await resolveNeonCredentials()
  if (!creds) return { usage: null, error: null, configured: false }
  try {
    return { usage: await fetchNeonUsage(creds), error: null, configured: true }
  } catch (err) {
    const error = neonErrorMessage(err)
    logger.warn('usage_neon_failed', { err: error })
    return { usage: null, error, configured: true }
  }
}

export async function takeUsageSnapshot(now: Date = new Date()): Promise<SnapshotResult> {
  const day = now.toISOString().slice(0, 10)
  const [measurements, neon] = await Promise.all([collectMeasurements(now), readNeon()])
  const readings = buildGlobalReadings(measurements, neon.usage)
  const throttles = evaluateThrottles(readings)

  let retentionRan = false
  if (throttles.includes('early_retention')) {
    try {
      const r = await runRetention(now)
      retentionRan = true
      logger.info('usage_early_retention', { ...r })
    } catch (err) {
      logger.error('usage_early_retention_failed', { err: err instanceof Error ? err.message : String(err) })
    }
  }

  const data: UsageSnapshotData = {
    readings,
    userReadings: buildUserReadings(measurements),
    largestTables: measurements.largestTables,
    neon: {
      connected: neon.usage !== null,
      computeState: neon.usage?.computeState ?? null,
      periodStart: neon.usage?.periodStart ?? null,
      periodEnd: neon.usage?.periodEnd ?? null,
      error: neon.configured ? neon.error : null,
    },
    retentionRan,
  }
  await db
    .insert(usageSnapshots)
    .values({ day, takenAt: now, data, throttles })
    .onConflictDoUpdate({ target: usageSnapshots.day, set: { takenAt: now, data, throttles } })
  clearThrottleCache()

  const todosCreated = await recordUsageAlerts(data, now)
  logger.info('usage_snapshot', {
    day,
    throttles,
    todosCreated,
    retentionRan,
    neonConnected: data.neon.connected,
    dbSizeBytes: measurements.dbSizeBytes,
  })
  return { day, throttles, todosCreated, retentionRan, neonConnected: data.neon.connected }
}

export interface StoredSnapshot {
  day: string
  takenAt: Date
  data: UsageSnapshotData
  throttles: string[]
}

/** Snapshots since `sinceDay` (inclusive), oldest first — for trends. */
export async function listSnapshotsSince(sinceDay: string): Promise<StoredSnapshot[]> {
  const rows = await db
    .select()
    .from(usageSnapshots)
    .where(gte(usageSnapshots.day, sinceDay))
    .orderBy(usageSnapshots.day)
  return rows.map((r) => ({ day: r.day, takenAt: r.takenAt, data: parseSnapshotData(r.data), throttles: r.throttles }))
}

/** Latest snapshot, or null before the first run. */
export async function latestSnapshot(): Promise<StoredSnapshot | null> {
  const [r] = await db.select().from(usageSnapshots).orderBy(desc(usageSnapshots.day)).limit(1)
  return r ? { day: r.day, takenAt: r.takenAt, data: parseSnapshotData(r.data), throttles: r.throttles } : null
}

export const REFRESH_INTERVAL_MS = 10 * 60 * 1000

/**
 * "Refresh now": at most once per REFRESH_INTERVAL_MS per user, claimed by
 * one conditional upsert (two clicks cannot both win).
 */
export async function claimRefreshSlot(userId: string, now: Date = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - REFRESH_INTERVAL_MS).toISOString()
  const rows = await db
    .insert(usageSettings)
    .values({ userId, lastRefreshAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: usageSettings.userId,
      set: { lastRefreshAt: now },
      setWhere: sql`${usageSettings.lastRefreshAt} is null or ${usageSettings.lastRefreshAt} <= ${since}::timestamptz`,
    })
    .returning()
  return rows.length > 0
}
