import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { usageSettings } from '@/lib/db/schema'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { quotaMeters } from '@/lib/ai/quota'
import type { QuotaStatus } from '@/lib/ai/quota-compute'
import { listServiceSecretStatuses } from '@/lib/settings/secrets'
import type { SecretSource } from '@/lib/settings/service-secrets'
import { logger } from '@/lib/logger'
import { databaseSizeBytes, emptyGlobalReadings } from './collect'
import { LEVEL_TREND_DAYS, utcPeriod, type MeterReading } from './meters'
import { EMPTY_SNAPSHOT_DATA, type UsageSnapshotData } from './snapshot-data'
import { listSnapshotsSince, REFRESH_INTERVAL_MS } from './snapshot'
import { loadThrottleState, THROTTLE_COPY, THROTTLE_IDS, type ThrottleId } from './throttle'
import { buildMeterViews, withLive, type MeterView } from './view-model'

/**
 * SERVER-ONLY. Everything Settings › Usage shows, from our own database:
 * the latest snapshot and this month's trend, plus two cheap live reads
 * (pg_database_size and the user's document bytes) and the AI quota
 * aggregates. No vendor API call happens here.
 */

export interface ThrottleView {
  id: ThrottleId
  title: string
  detail: string
  /** The latest snapshot asked for it. */
  requested: boolean
  /** In force now (not resumed by the owner). */
  active: boolean
}

export interface UsagePageData {
  snapshotAt: Date | null
  meters: MeterView[]
  largestTables: { name: string; bytes: number }[]
  neon: UsageSnapshotData['neon'] & { keySource: SecretSource; projectId: string | null }
  throttles: ThrottleView[]
  resumed: boolean
  ai: QuotaStatus[]
  /** When "Refresh now" is next allowed (null = now). */
  refreshAvailableAt: Date | null
}

function trendStartDay(now: Date): string {
  const monthStart = `${utcPeriod(now)}-01`
  const levelStart = new Date(now.getTime() - LEVEL_TREND_DAYS * 86_400_000).toISOString().slice(0, 10)
  return monthStart < levelStart ? monthStart : levelStart
}

async function safe<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    logger.warn('usage_page_read_failed', { what, err: err instanceof Error ? err.message : String(err) })
    return fallback
  }
}

export async function getUsagePageData(userId: string, now: Date = new Date()): Promise<UsagePageData> {
  const [history, dbSize, assetBytes, ai, throttleState, settings, secrets] = await Promise.all([
    listSnapshotsSince(trendStartDay(now)),
    safe('db_size', () => databaseSizeBytes(), null),
    safe('asset_bytes', () => assetsQ.totalBytes(userId), null),
    safe('ai_quota', () => quotaMeters(userId, now), [] as QuotaStatus[]),
    loadThrottleState(now),
    db.select().from(usageSettings).where(eq(usageSettings.userId, userId)).limit(1),
    listServiceSecretStatuses(userId),
  ])
  const latest = history.at(-1) ?? null
  const data = latest?.data ?? EMPTY_SNAPSHOT_DATA
  const base = data.readings.length > 0 ? data.readings : emptyGlobalReadings()
  const live: MeterReading[] = [
    ...(dbSize === null ? [] : [{ id: 'neon_storage', used: dbSize, source: 'measured' } as const]),
    ...(assetBytes === null ? [] : [{ id: 'asset_storage', used: assetBytes, source: 'measured' } as const]),
  ]
  const readings = withLive(base, live)
  const meters = buildMeterViews({ readings, history, userId, now })
  const s = settings[0]
  const lastRefresh = s?.lastRefreshAt?.getTime() ?? 0
  const nextRefresh = lastRefresh + REFRESH_INTERVAL_MS
  return {
    snapshotAt: latest?.takenAt ?? null,
    meters,
    largestTables: data.largestTables,
    neon: {
      ...data.neon,
      keySource: secrets.find((x) => x.info.id === 'neon')?.source ?? 'none',
      projectId: s?.neonProjectId ?? null,
    },
    throttles: THROTTLE_IDS.map((id) => ({
      id,
      ...THROTTLE_COPY[id],
      requested: throttleState.requested.has(id),
      active: throttleState.active.has(id),
    })),
    resumed: throttleState.resumed,
    ai,
    refreshAvailableAt: nextRefresh > now.getTime() ? new Date(nextRefresh) : null,
  }
}
