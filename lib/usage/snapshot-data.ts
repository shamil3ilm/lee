import { z } from 'zod'
import { GLOBAL_METER_IDS, USER_METER_IDS, type MeterReading } from './meters'

/**
 * Shape of `usage_snapshots.data` (client-safe). Parsed with zod on read so
 * an old or hand-edited row degrades to "no data" instead of crashing the
 * Settings page or the dashboard.
 */

const METER_ID = z.enum([...GLOBAL_METER_IDS, ...USER_METER_IDS])
const SOURCE = z.enum(['measured', 'neon_api', 'estimated', 'unavailable', 'vendor_dashboard', 'placeholder'])

const readingSchema = z.object({
  id: METER_ID,
  used: z.number().finite().nullable(),
  source: SOURCE,
})

export const snapshotDataSchema = z.object({
  readings: z.array(readingSchema).default([]),
  /** userId → that user's own meters (document files). */
  userReadings: z.record(z.string(), z.array(readingSchema)).default({}),
  largestTables: z.array(z.object({ name: z.string(), bytes: z.number().finite() })).default([]),
  neon: z
    .object({
      connected: z.boolean(),
      computeState: z.string().nullable(),
      periodStart: z.string().nullable(),
      periodEnd: z.string().nullable(),
      /** Friendly message only (never upstream text). */
      error: z.string().nullable(),
    })
    .default({ connected: false, computeState: null, periodStart: null, periodEnd: null, error: null }),
  retentionRan: z.boolean().default(false),
})

export type UsageSnapshotData = z.infer<typeof snapshotDataSchema>

export const EMPTY_SNAPSHOT_DATA: UsageSnapshotData = snapshotDataSchema.parse({})

export function parseSnapshotData(raw: unknown): UsageSnapshotData {
  const r = snapshotDataSchema.safeParse(raw)
  return r.success ? r.data : EMPTY_SNAPSHOT_DATA
}

export function readingOf(readings: readonly MeterReading[], id: MeterReading['id']): MeterReading | undefined {
  return readings.find((r) => r.id === id)
}
