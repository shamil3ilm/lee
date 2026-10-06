import type { AcademyContent } from '@/lib/academy/content/catalog'
import type { Level } from '@/lib/academy/levels'
import type { StudyTarget } from '@/lib/academy/placement/study'

/** Inputs and outputs of the adaptive selector and the daily plan (v13 §3.3–3.4). */

export interface SkillState {
  skillId: string
  rating: number
  /** Already decayed for idle time (lib/academy/rating.ts ratingAsOf). */
  deviation: number
  level: Level
  attempts: number
  lastPracticedAt: Date | null
}

export interface UpcomingInterview {
  stageId: string
  /** interview_stages.kind (lib/stages/kinds.ts, plus legacy kinds). */
  kind: string
  title: string
  company: string
  scheduledAt: Date
}

export const PLAN_MODES = ['balanced', 'quick', 'deep', 'sprint'] as const
export type PlanMode = (typeof PLAN_MODES)[number]

export const PLAN_MODE_LABELS: Readonly<Record<PlanMode, string>> = {
  balanced: 'Balanced',
  quick: 'Quick drill',
  deep: 'Deep session',
  sprint: 'Interview sprint',
}

export interface PlanInputs {
  content: AcademyContent
  now: Date
  /** The user's local day, YYYY-MM-DD. */
  today: string
  timeZone?: string
  timeBudgetMin: number
  mode: PlanMode
  ratings: ReadonlyMap<string, SkillState>
  dueReviews: number
  interviews: readonly UpcomingInterview[]
  studyTargets: readonly StudyTarget[]
  /** Most recent first. */
  recentItemIds: readonly string[]
  placement: { done: boolean; remaining: number }
}

export const PLAN_ITEM_KINDS = ['placement', 'review', 'interview', 'study', 'weakness', 'uncertain', 'stretch'] as const
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number]

export interface PlanReason {
  code: PlanItemKind
  text: string
}

export interface PlanItem {
  /** Stable within a day: `${kind}:${skillId|kind}`. */
  id: string
  kind: PlanItemKind
  skillId: string | null
  itemId: string | null
  minutes: number
  title: string
  reasons: PlanReason[]
  status: 'todo' | 'done'
  attemptId: string | null
}

export interface Plan {
  items: PlanItem[]
  totalMinutes: number
}
