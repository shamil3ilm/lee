import { TONE_TEXT, type StageTone } from '@/lib/ui/tones'

export const APPLICATION_STATUSES = [
  'saved',
  'applied',
  'screen',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  screen: 'Screen',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

/**
 * Badge variant names. The legacy colour names (slate, blue, …) are kept as
 * aliases so older call sites keep compiling; they now resolve to the brand
 * tone tokens (see components/ui/badge.tsx and lib/ui/tones.ts).
 */
export type BadgeVariant =
  | 'slate'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'emerald'
  | 'rose'
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | StageTone

/** Each pipeline stage's tone: badges, kanban columns and charts agree. */
export const STATUS_TONE: Record<ApplicationStatus, StageTone> = {
  saved: 'saved',
  applied: 'applied',
  screen: 'screen',
  interview: 'interview',
  offer: 'offer',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
}

export const STATUS_BADGE: Record<ApplicationStatus, BadgeVariant> = STATUS_TONE

export const STATUS_ACCENT: Record<ApplicationStatus, string> = {
  saved: TONE_TEXT.saved,
  applied: TONE_TEXT.applied,
  screen: TONE_TEXT.screen,
  interview: TONE_TEXT.interview,
  offer: TONE_TEXT.offer,
  rejected: TONE_TEXT.rejected,
  withdrawn: TONE_TEXT.withdrawn,
}

export const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  'saved',
  'applied',
  'screen',
  'interview',
  'offer',
]

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status)
}
