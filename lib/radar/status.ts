import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { readRunRecord } from '@/lib/queue/run-summary'
import type { RadarRunSummary } from './summary'
import { RADAR_SOURCES, type RadarSource } from './types'

/**
 * Per-source staleness and errors for Radar › Sources, read from the run
 * summaries of the user's recent `radar-source` jobs (finished jobs are
 * kept for two weeks, lib/db/retention/logs.ts).
 */

export const STALE_AFTER_HOURS = 48
const LOOKBACK_DAYS = 14

export interface RadarRun {
  at: Date
  summary: RadarRunSummary
}

export interface SourceStatus {
  source: RadarSource
  lastRunAt: Date | null
  /** Last run that fetched successfully. */
  lastOkAt: Date | null
  lastNew: number
  /** The latest run's error (failed, or partial failures). */
  lastError: string | null
  state: 'ok' | 'stale' | 'failing' | 'off' | 'never'
}

/** Pure: summarise runs (any order) per source. */
export function sourceStatuses(runs: readonly RadarRun[], now: Date, off: ReadonlySet<string> = new Set()): SourceStatus[] {
  const sorted = [...runs].sort((a, b) => b.at.getTime() - a.at.getTime())
  return RADAR_SOURCES.map((source): SourceStatus => {
    const mine = sorted.filter((r) => r.summary.source === source && r.summary.status !== 'paused')
    const latest = mine[0] ?? null
    const ok = mine.find((r) => r.summary.status === 'polled') ?? null
    const lastError = latest && (latest.summary.status === 'failed' || latest.summary.partialErrors) ? (latest.summary.error ?? 'failed') : null
    const base = { source, lastRunAt: latest?.at ?? null, lastOkAt: ok?.at ?? null, lastNew: ok?.summary.new ?? 0, lastError }
    if (off.has(source)) return { ...base, state: 'off' }
    if (!latest) return { ...base, state: 'never' }
    if (latest.summary.status === 'failed') return { ...base, state: 'failing' }
    const fresh = ok && now.getTime() - ok.at.getTime() <= STALE_AFTER_HOURS * 3_600_000
    return { ...base, state: fresh || latest.summary.status === 'skipped' ? 'ok' : 'stale' }
  })
}

export async function loadSourceStatuses(userId: string, off: readonly string[], now: Date = new Date()): Promise<SourceStatus[]> {
  const rows = await db
    .select({ finishedAt: queueJobs.finishedAt, updatedAt: queueJobs.updatedAt, result: queueJobs.result })
    .from(queueJobs)
    .where(
      and(
        eq(queueJobs.userId, userId),
        eq(queueJobs.type, JOB_TYPES.radarSource),
        inArray(queueJobs.status, ['done', 'dead']),
        gte(queueJobs.updatedAt, new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000)),
      ),
    )
    .orderBy(desc(queueJobs.updatedAt))
    .limit(200)
  const runs = rows.flatMap((r): RadarRun[] => {
    const summary = readRunRecord(r.result).summary
    return summary?.kind === 'radar-source' ? [{ at: r.finishedAt ?? r.updatedAt, summary }] : []
  })
  return sourceStatuses(runs, now, new Set(off))
}
