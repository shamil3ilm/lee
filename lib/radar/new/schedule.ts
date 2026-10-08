import { JOB_PRIORITY, JOB_TYPES, jobKeys, utcDay } from '@/lib/queue/job-types'
import { enqueueMany } from '@/lib/queue/queue'
import { NEW_SOURCES } from './types'

/**
 * The daily shared What's new jobs: one global `radar-new:source` job per
 * source per UTC day, however many accounts there are (idempotent per
 * day). Due RADAR_NEW_DELAY_MS after the daily schedule, so the day's
 * job-search work drains first; the next cron drain runs them.
 */

export const RADAR_NEW_DELAY_MS = 2 * 60 * 60 * 1000

export async function scheduleWhatsNew(now: Date = new Date()): Promise<{ planned: number; enqueued: number }> {
  const day = utcDay(now)
  const runAfter = new Date(now.getTime() + RADAR_NEW_DELAY_MS)
  const { created } = await enqueueMany(
    NEW_SOURCES.map((source) => ({
      type: JOB_TYPES.radarNew,
      userId: null,
      runAfter,
      payload: { source },
      idempotencyKey: jobKeys.radarNew(source, day),
      priority: JOB_PRIORITY[JOB_TYPES.radarNew],
      maxAttempts: 1,
    })),
  )
  return { planned: NEW_SOURCES.length, enqueued: created }
}
