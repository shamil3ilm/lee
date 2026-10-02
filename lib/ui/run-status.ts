import type { EventLevel } from '@/lib/logs/types'
import type { JobStatus } from '@/lib/queue/types'
import type { SemanticTone } from './tones'

/** Settings › Background jobs / Logs status vocabulary (tones from lib/ui/tones.ts). */

export const JOB_STATUS_LABEL: Readonly<Record<JobStatus, string>> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Retrying',
  dead: 'Gave up',
}

export const JOB_STATUS_TONE: Readonly<Record<JobStatus, SemanticTone>> = {
  queued: 'neutral',
  running: 'info',
  done: 'success',
  failed: 'warning',
  dead: 'danger',
}

export const EVENT_LEVEL_LABEL: Readonly<Record<EventLevel, string>> = {
  info: 'Info',
  warn: 'Warning',
  error: 'Error',
}

export const EVENT_LEVEL_TONE: Readonly<Record<EventLevel, SemanticTone>> = {
  info: 'info',
  warn: 'warning',
  error: 'danger',
}

/** "850 ms", "12.4 s", "2 min 5 s" */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return sec > 0 ? `${min} min ${sec} s` : `${min} min`
}
