import { z } from 'zod'

/**
 * Client-safe: the retention windows a user can edit in Settings › Storage,
 * with defaults and bounds. Windows not listed here (queue jobs, Gmail dedup
 * markers, PDF cache, sessions, usage history) are operational and fixed.
 */

export const RETENTION_WINDOW_IDS = [
  'staleDiscoveryDays',
  'dismissedDiscoveryDays',
  'aiCallLogDays',
  'cvScoreDays',
  'labRunDays',
  'webVitalsDays',
] as const

export type RetentionWindowId = (typeof RETENTION_WINDOW_IDS)[number]
export type RetentionPolicy = Readonly<Record<RetentionWindowId, number>>

export interface RetentionWindow {
  id: RetentionWindowId
  label: string
  description: string
  defaultDays: number
  minDays: number
  maxDays: number
}

export const RETENTION_WINDOWS: readonly RetentionWindow[] = [
  {
    id: 'staleDiscoveryDays',
    label: 'Unreviewed discoveries',
    description: 'Postings still in the inbox after this many days move to Dismissed (you can restore them).',
    defaultDays: 60,
    minDays: 7,
    maxDays: 365,
  },
  {
    id: 'dismissedDiscoveryDays',
    label: 'Dismissed discoveries',
    description: 'After this many days a dismissed posting keeps only its title, so it is never suggested again.',
    defaultDays: 30,
    minDays: 7,
    maxDays: 365,
  },
  {
    id: 'aiCallLogDays',
    label: 'AI call logs',
    description: 'Token and latency records behind Analytics › AI.',
    defaultDays: 180,
    minDays: 30,
    maxDays: 730,
  },
  {
    id: 'cvScoreDays',
    label: 'CV score history',
    description: 'Older score runs are removed; the latest score for each CV and job is always kept.',
    defaultDays: 365,
    minDays: 30,
    maxDays: 1825,
  },
  {
    id: 'labRunDays',
    label: 'Model Lab runs',
    description: 'Runs with a blind vote are always kept.',
    defaultDays: 180,
    minDays: 30,
    maxDays: 730,
  },
  {
    id: 'webVitalsDays',
    label: 'Performance data',
    description: 'Daily web vitals aggregates behind Analytics › Performance (it shows up to 28 days).',
    defaultDays: 90,
    minDays: 28,
    maxDays: 365,
  },
]

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = Object.freeze(
  Object.fromEntries(RETENTION_WINDOWS.map((w) => [w.id, w.defaultDays])) as Record<RetentionWindowId, number>,
)

function daysField(w: RetentionWindow) {
  return z.coerce
    .number({ error: `${w.label}: enter a number of days.` })
    .int(`${w.label}: use whole days.`)
    .min(w.minDays, `${w.label}: at least ${w.minDays} days.`)
    .max(w.maxDays, `${w.label}: at most ${w.maxDays} days.`)
}

/** Validates a full set of windows (form input arrives as strings). */
export const retentionPolicySchema = z.object(
  Object.fromEntries(RETENTION_WINDOWS.map((w) => [w.id, daysField(w)])) as Record<
    RetentionWindowId,
    ReturnType<typeof daysField>
  >,
)

/** A stored row's windows, with null (or out-of-range) columns → default. */
export function policyFrom(
  row: Partial<Record<RetentionWindowId, number | null>> | null | undefined,
): RetentionPolicy {
  return Object.freeze(
    Object.fromEntries(
      RETENTION_WINDOWS.map((w) => {
        const v = row?.[w.id]
        const ok = typeof v === 'number' && Number.isInteger(v) && v >= w.minDays && v <= w.maxDays
        return [w.id, ok ? v : w.defaultDays]
      }),
    ) as Record<RetentionWindowId, number>,
  )
}
