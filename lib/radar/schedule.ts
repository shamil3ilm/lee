import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { radarWatchTerms, userProfile } from '@/lib/db/schema'
import { drain } from '@/lib/queue/drain'
import { JOB_TYPES, jobKeys } from '@/lib/queue/job-types'
import { enqueueMany } from '@/lib/queue/queue'
import { RADAR_SOURCES, type RadarSource } from './types'

/**
 * Radar planning. The daily scheduler (lib/queue/scheduler.ts) queues one
 * job per source for every user who watches at least one (unmuted) term,
 * minus the sources they switched off in Radar › Sources. Radar › Refresh
 * now queues the same jobs at most once an hour and drains what fits.
 */

export const RADAR_MANUAL_PRIORITY = 16
export const RADAR_MANUAL_BUDGET_MS = 45_000

/** user id → the radar sources to run today (one user when `onlyUserId` is given). */
export async function radarSourcesByUser(onlyUserId?: string): Promise<Map<string, RadarSource[]>> {
  const rows = await db
    .select({ userId: radarWatchTerms.userId, off: userProfile.radarSourcesOff })
    .from(radarWatchTerms)
    .leftJoin(userProfile, eq(userProfile.userId, radarWatchTerms.userId))
    .where(and(eq(radarWatchTerms.muted, false), onlyUserId ? eq(radarWatchTerms.userId, onlyUserId) : undefined))
    .groupBy(radarWatchTerms.userId, userProfile.radarSourcesOff)
  return new Map(
    rows.map((r) => {
      const off = new Set(r.off ?? [])
      return [r.userId, RADAR_SOURCES.filter((s) => !off.has(s))]
    }),
  )
}

export type RadarRefresh = { status: 'done'; ran: number; failed: number } | { status: 'recent' } | { status: 'queued' } | { status: 'no_terms' }

/** Radar › Refresh now. */
export async function refreshRadarNow(userId: string, now: Date = new Date()): Promise<RadarRefresh> {
  const sources = (await radarSourcesByUser(userId)).get(userId) ?? []
  if (sources.length === 0) return { status: 'no_terms' }
  const hour = now.toISOString().slice(0, 13)
  const { created } = await enqueueMany(
    sources.map((source) => ({
      type: JOB_TYPES.radarSource,
      userId,
      runAfter: now,
      payload: { source, trigger: 'manual' },
      idempotencyKey: jobKeys.radarSourceManual(userId, source, hour),
      priority: RADAR_MANUAL_PRIORITY,
      maxAttempts: 1,
    })),
  )
  if (created === 0) return { status: 'recent' }
  const r = await drain({ userId, types: [JOB_TYPES.radarSource], maxJobs: created, budgetMs: RADAR_MANUAL_BUDGET_MS, concurrency: 3 })
  if (r.done + r.failed + r.dead === 0) return { status: 'queued' }
  return { status: 'done', ran: r.done, failed: r.failed + r.dead }
}
