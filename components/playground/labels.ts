import type { BadgeProps } from '@/components/ui/badge'
import type { PlanItemKind } from '@/lib/academy/selector/types'

/** Human labels and tones for Playground values. Client-safe. */

export const PLAN_KIND_LABELS: Readonly<Record<PlanItemKind, string>> = {
  placement: 'Placement',
  review: 'Review',
  interview: 'Interview prep',
  coding: 'Coding problem',
  study: 'Study list',
  weakness: 'Weak spot',
  uncertain: 'Calibrate',
  stretch: 'Stretch',
}

export const PLAN_KIND_BADGE: Readonly<Record<PlanItemKind, NonNullable<BadgeProps['variant']>>> = {
  placement: 'info',
  review: 'neutral',
  interview: 'interview',
  coding: 'info',
  study: 'warning',
  weakness: 'danger',
  uncertain: 'neutral',
  stretch: 'success',
}

export const FORMAT_LABELS: Readonly<Record<string, string>> = {
  concept_check: 'Concept check',
  predict_output: 'Predict the output',
  coding: 'Coding problem',
}

export const MODE_LABELS: Readonly<Record<string, string>> = {
  practice: 'Practice',
  plan: 'Daily plan',
  diagnostic: 'Placement',
  daily: 'Daily problem',
  mock: 'Mock assessment',
}

export function levelBadge(level: number): NonNullable<BadgeProps['variant']> {
  if (level >= 4) return 'success'
  if (level === 3) return 'info'
  if (level >= 1) return 'warning'
  return 'neutral'
}
