/**
 * One priority vocabulary for every todo surface (list rows, board cards,
 * the dashboard's Needs attention): tinted tone badges, so "High" looks the
 * same everywhere and never becomes the one solid saturated fill on a page.
 */
export interface PriorityBadge {
  label: string
  variant: 'secondary' | 'warning' | 'danger'
}

const PRIORITY_BADGES: Readonly<Record<number, PriorityBadge>> = {
  1: { label: 'Low', variant: 'secondary' },
  2: { label: 'Med', variant: 'warning' },
  3: { label: 'High', variant: 'danger' },
}

/** Badge for a todo priority, or null for "none" (0) and unknown values. */
export function priorityBadge(priority: number): PriorityBadge | null {
  return PRIORITY_BADGES[priority] ?? null
}
