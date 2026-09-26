import type { Tone } from '@/lib/ui/tones'

/**
 * Interview stage statuses the UI may set. Client-safe. The column is plain
 * text; limiting the surface keeps the UI honest and analytics bounded.
 */
export const STAGE_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const
export type StageStatus = (typeof STAGE_STATUSES)[number]

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Done',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

export const STAGE_STATUS_TONE: Record<StageStatus, Tone> = {
  scheduled: 'info',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'warning',
}

/** Board columns. A no-show sits in the Cancelled column with its badge. */
export const STAGE_BOARD_COLUMNS = ['scheduled', 'completed', 'cancelled'] as const
export type StageBoardColumn = (typeof STAGE_BOARD_COLUMNS)[number]

export function stageBoardColumn(status: string): StageBoardColumn {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled' || status === 'no_show') return 'cancelled'
  return 'scheduled'
}
