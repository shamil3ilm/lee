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

export type BadgeVariant =
  | 'slate'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'emerald'
  | 'rose'
  | 'neutral'

export const STATUS_BADGE: Record<ApplicationStatus, BadgeVariant> = {
  saved: 'slate',
  applied: 'blue',
  screen: 'indigo',
  interview: 'violet',
  offer: 'emerald',
  rejected: 'rose',
  withdrawn: 'neutral',
}

export const STATUS_ACCENT: Record<ApplicationStatus, string> = {
  saved: 'text-slate-500 dark:text-slate-400',
  applied: 'text-blue-600 dark:text-blue-400',
  screen: 'text-indigo-600 dark:text-indigo-400',
  interview: 'text-violet-600 dark:text-violet-400',
  offer: 'text-emerald-600 dark:text-emerald-400',
  rejected: 'text-rose-600 dark:text-rose-400',
  withdrawn: 'text-neutral-500 dark:text-neutral-400',
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
