import { stageKindLabel } from '@/lib/academy/selector/interviews'

/**
 * "Actions due" for the digest: what to do, when, and for which
 * application. Two inputs: an application's next action (named from its
 * status, since only the date is stored) and interview stages scheduled in
 * the window (named from the stage). Pure; the page formats the dates.
 */

export interface DueAppInput {
  applicationId: string
  status: string
  nextActionAt: Date | null
  companyName: string | null
  jobTitle: string | null
}

export interface DueStageInput {
  applicationId: string
  kind: string
  title: string | null
  scheduledAt: Date
  companyName: string | null
  jobTitle: string | null
}

export interface DueAction {
  key: string
  kind: 'next_action' | 'stage'
  applicationId: string
  companyName: string | null
  jobTitle: string | null
  /** "Follow up", "Apply", "Technical screen", or the stage's own title. */
  action: string
  at: Date
  overdue: boolean
}

const STATUS_ACTION: Readonly<Record<string, string>> = {
  saved: 'Apply',
  applied: 'Follow up',
  screen: 'Follow up',
  interview: 'Follow up',
  offer: 'Reply to the offer',
}

/** Same moment, give or take a minute: a stage and the next action it set. */
const SAME_MS = 60_000

export function buildDueActions(apps: readonly DueAppInput[], stages: readonly DueStageInput[], now: Date): DueAction[] {
  const out: DueAction[] = stages.map((s) => ({
    key: `stage-${s.applicationId}-${s.scheduledAt.getTime()}`,
    kind: 'stage',
    applicationId: s.applicationId,
    companyName: s.companyName,
    jobTitle: s.jobTitle,
    action: s.title?.trim() || stageKindLabel(s.kind),
    at: s.scheduledAt,
    overdue: s.scheduledAt.getTime() < now.getTime(),
  }))
  for (const a of apps) {
    if (!a.nextActionAt) continue
    const at = a.nextActionAt
    const dup = stages.some((s) => s.applicationId === a.applicationId && Math.abs(s.scheduledAt.getTime() - at.getTime()) < SAME_MS)
    if (dup) continue
    out.push({
      key: `next-${a.applicationId}`,
      kind: 'next_action',
      applicationId: a.applicationId,
      companyName: a.companyName,
      jobTitle: a.jobTitle,
      action: STATUS_ACTION[a.status] ?? 'Review',
      at,
      overdue: at.getTime() < now.getTime(),
    })
  }
  return out.sort((x, y) => x.at.getTime() - y.at.getTime())
}

/** The word shown instead of a date for a missed action. */
export function dueLabel(a: Pick<DueAction, 'overdue'>): string | null {
  return a.overdue ? 'overdue' : null
}
