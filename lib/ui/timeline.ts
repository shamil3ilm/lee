/**
 * Timeline data model — kept in a plain server-safe module so both the
 * client `<Timeline>` component and RSC pages can share the same types
 * without smuggling client-only code into the server bundle.
 */

export interface TimelineActivity {
  kind: 'activity'
  id: string
  createdAt: string
  activityKind: string
  payload: unknown
}

export interface TimelineStage {
  kind: 'stage'
  id: string
  createdAt: string
  stageKind: string
  title: string | null
  scheduledAt: string | null
  status: string
  outcome: string | null
  prepNotesMd: string | null
  debriefNotesMd: string | null
  /** Google Calendar event id if the stage has been pushed; null otherwise. */
  googleEventId: string | null
  /**
   * v4.3 — id of the latest `interview_debrief` document linked to this stage
   * (matched by content.stageId on the server), if any. Null when the user
   * has captured quick notes but not yet generated the AI summary.
   */
  debriefDocId?: string | null
}

export type TimelineItem = TimelineActivity | TimelineStage

/**
 * Merge activities + stages into a single chronological timeline (newest first).
 * Stages use scheduledAt when present; otherwise createdAt so freshly-created
 * unscheduled stages still surface at the top.
 */
export function mergeTimeline(
  activities: TimelineActivity[],
  stages: TimelineStage[],
): TimelineItem[] {
  const combined: TimelineItem[] = [...activities, ...stages]
  combined.sort((a, b) => timestampOf(b) - timestampOf(a))
  return combined
}

function timestampOf(item: TimelineItem): number {
  if (item.kind === 'stage' && item.scheduledAt) return new Date(item.scheduledAt).getTime()
  return new Date(item.createdAt).getTime()
}
