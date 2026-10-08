import { plural } from '@/lib/ui/labels'
import { RADAR_SOURCE_LABELS, type RadarSource } from './types'

/**
 * The run summary of one radar source job, stored on its queue_jobs row
 * and read back for Radar › Sources (staleness and last error). Pure.
 */

export type RadarRunStatus = 'polled' | 'failed' | 'skipped' | 'off' | 'paused'

export interface RadarRunSummary {
  kind: 'radar-source'
  source: RadarSource
  status: RadarRunStatus
  fetched: number
  new: number
  matched: number
  /** Short, safe error text (failed runs and partial failures). */
  error?: string
  /** Requests that failed while the rest succeeded. */
  partialErrors?: number
}

export function describeRadarSummary(s: RadarRunSummary): string {
  const label = RADAR_SOURCE_LABELS[s.source] ?? s.source
  if (s.status === 'off') return `${label}: switched off`
  if (s.status === 'paused') return `${label}: paused by the usage throttle`
  if (s.status === 'skipped') return `${label}: no watch terms`
  if (s.status === 'failed') return `${label}: failed${s.error ? ` (${s.error})` : ''}`
  const parts = [`${s.fetched} found`, `${s.new} new`]
  if (s.matched > 0) parts.push(`${s.matched} on watch terms`)
  if (s.partialErrors) parts.push(`${plural(s.partialErrors, 'request')} failed`)
  return `${label}: ${parts.join(' · ')}`
}
