import { desc, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { todos, usageAlerts, usageSnapshots, users } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { formatMeterValue } from './format'
import {
  crossedThreshold,
  meterFraction,
  METER_DEFS,
  utcPeriod,
  type MeterId,
  type MeterReading,
} from './meters'
import { parseSnapshotData, type UsageSnapshotData } from './snapshot-data'

/**
 * Warnings at 70 % / 90 % (v17 §9.6 item 7): the dashboard banner, one todo
 * per meter per threshold per month (idempotent through usage_alerts' unique
 * key), and a section in the weekly digest.
 */

export interface UsageWarning {
  meter: MeterId
  label: string
  fraction: number
  threshold: 70 | 90
  /** "412 MB of 512 MB" */
  detail: string
}

/** Pure: warnings for one user from a snapshot's global + that user's readings. */
export function warningsFor(data: UsageSnapshotData, userId: string): UsageWarning[] {
  const readings: MeterReading[] = [...data.readings, ...(data.userReadings[userId] ?? [])]
  const out: UsageWarning[] = []
  for (const r of readings) {
    const d = METER_DEFS[r.id]
    if (!d.warns || !d.limit) continue
    const fraction = meterFraction(r.used, d.limit.value)
    const threshold = crossedThreshold(fraction)
    if (threshold === null || fraction === null || r.used === null) continue
    out.push({
      meter: r.id,
      label: d.label,
      fraction,
      threshold,
      detail: `${formatMeterValue(d.unit, r.used)} of ${formatMeterValue(d.unit, d.limit.value)}`,
    })
  }
  return out.sort((a, b) => b.fraction - a.fraction)
}

/** A usage todo is due within a week so it shows in "This week" and the digest. */
const TODO_DUE_DAYS = 7

function todoTitle(w: UsageWarning): string {
  return `Free tier: ${w.label} at ${Math.floor(w.fraction * 100)}%`
}

function todoNotes(w: UsageWarning): string {
  const next =
    w.threshold === 90
      ? 'At 90% lee pauses non-essential background work or compacts storage early (see Settings › Usage).'
      : 'Nothing is throttled yet; at 90% lee starts pausing non-essential work.'
  return `${w.detail} used. ${next}\n\nReview it in [Settings › Usage](/settings/usage).`
}

/**
 * Record crossed thresholds for every user and add a todo for the highest
 * newly crossed one. Re-running (Refresh now, a duplicate job) inserts
 * nothing: each (user, month, meter, threshold) exists once. Crossing 90
 * first also records 70, so falling back to 75 % later adds no second todo.
 * Returns the number of todos created.
 */
export async function recordUsageAlerts(data: UsageSnapshotData, now: Date): Promise<number> {
  const period = utcPeriod(now)
  const allUsers = await db.select({ id: users.id }).from(users)
  let created = 0
  for (const u of allUsers) {
    for (const w of warningsFor(data, u.id)) {
      try {
        if (await recordOne(u.id, period, w, now)) created += 1
      } catch (err) {
        logger.warn('usage_alert_failed', { meter: w.meter, err: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  return created
}

async function recordOne(userId: string, period: string, w: UsageWarning, now: Date): Promise<boolean> {
  const thresholds = w.threshold === 90 ? [70, 90] : [70]
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(usageAlerts)
      .values(thresholds.map((threshold) => ({ userId, period, meter: w.meter, threshold, fraction: w.fraction })))
      .onConflictDoNothing()
      .returning()
    const top = inserted.find((r) => r.threshold === w.threshold)
    if (!top) return false
    const [todo] = await tx
      .insert(todos)
      .values({
        userId,
        title: todoTitle(w),
        notesMd: todoNotes(w),
        priority: w.threshold === 90 ? 3 : 2,
        dueAt: new Date(now.getTime() + TODO_DUE_DAYS * 86_400_000),
        tags: ['free-tier'],
      })
      .returning()
    if (todo) await tx.update(usageAlerts).set({ todoId: todo.id }).where(eq(usageAlerts.id, top.id))
    return true
  })
}

/**
 * Current warnings for the banner and the digest: the latest snapshot, if
 * it is from this UTC month (an old month's numbers no longer apply).
 * One indexed read (primary key order, limit 1).
 */
export async function usageWarningsForUser(
  userId: string,
  now: Date = new Date(),
  client: DbClient = db,
): Promise<UsageWarning[]> {
  const [row] = await client
    .select({ day: usageSnapshots.day, data: usageSnapshots.data })
    .from(usageSnapshots)
    .orderBy(desc(usageSnapshots.day))
    .limit(1)
  if (!row || row.day.slice(0, 7) !== utcPeriod(now)) return []
  return warningsFor(parseSnapshotData(row.data), userId)
}
