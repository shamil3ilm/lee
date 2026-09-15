import {
  Activity as ActivityIcon,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { relativeFromNow, shortDateTime } from '@/lib/ui/date'
import { STATUS_BADGE, STATUS_LABELS, type ApplicationStatus } from '@/lib/ui/status'

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
}

export type TimelineItem = TimelineActivity | TimelineStage

interface TimelineProps {
  items: TimelineItem[]
}

const STAGE_KIND_LABELS: Record<string, string> = {
  phone_screen: 'Phone screen',
  technical: 'Technical',
  system_design: 'System design',
  onsite: 'Onsite',
  final: 'Final',
  other: 'Other',
}

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  status_change: ArrowRightLeft,
  note: StickyNote,
  message: MessageSquare,
  file: FileText,
}

export function Timeline({ items }: TimelineProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <Clock className="size-5" />
        <span>No activity yet.</span>
      </div>
    )
  }
  return (
    <ol className="space-y-3">
      {items.map((item) =>
        item.kind === 'stage' ? (
          <StageItem key={`s-${item.id}`} item={item} />
        ) : (
          <ActivityItem key={`a-${item.id}`} item={item} />
        ),
      )}
    </ol>
  )
}

function StageItem({ item }: { item: TimelineStage }) {
  const label = item.title || STAGE_KIND_LABELS[item.stageKind] || item.stageKind
  return (
    <li className="rounded-md border bg-card p-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded bg-violet-100 p-1.5 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          <Calendar className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-medium leading-tight">{label}</div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] capitalize">
                {item.status}
              </Badge>
              {item.outcome ? (
                <Badge
                  variant={item.outcome === 'pass' ? 'emerald' : item.outcome === 'fail' ? 'rose' : 'neutral'}
                  className="text-[10px] capitalize"
                >
                  {item.outcome}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {item.scheduledAt ? (
              <>
                <span>{shortDateTime(item.scheduledAt)}</span>
                <span className="mx-1">·</span>
                <span>{relativeFromNow(item.scheduledAt)}</span>
              </>
            ) : (
              <span>Unscheduled</span>
            )}
          </div>
          {item.prepNotesMd ? (
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Prep: </span>
              {item.prepNotesMd}
            </p>
          ) : null}
          {item.debriefNotesMd ? (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Debrief: </span>
              {item.debriefNotesMd}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function ActivityItem({ item }: { item: TimelineActivity }) {
  const Icon = ACTIVITY_ICONS[item.activityKind] ?? ActivityIcon
  return (
    <li className="flex items-start gap-3 px-1 py-1 text-sm">
      <div className="mt-0.5 rounded bg-muted p-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium capitalize">
            {activityLabel(item.activityKind, item.payload)}
          </span>
          <span className="text-xs text-muted-foreground">
            {shortDateTime(item.createdAt)}
          </span>
        </div>
      </div>
    </li>
  )
}

function activityLabel(kind: string, payload: unknown): React.ReactNode {
  if (kind === 'status_change' && isStatusPayload(payload)) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">Moved</span>
        {payload.from ? (
          <Badge variant={STATUS_BADGE[payload.from]} className="text-[10px]">
            {STATUS_LABELS[payload.from]}
          </Badge>
        ) : (
          <span className="text-muted-foreground">created</span>
        )}
        <span className="text-muted-foreground">→</span>
        <Badge variant={STATUS_BADGE[payload.to]} className="text-[10px]">
          {STATUS_LABELS[payload.to]}
        </Badge>
      </span>
    )
  }
  return kind.replace(/_/g, ' ')
}

function isStatusPayload(
  payload: unknown,
): payload is { from: ApplicationStatus | null; to: ApplicationStatus } {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as { from?: unknown; to?: unknown }
  return typeof p.to === 'string' && (p.from === null || typeof p.from === 'string')
}

/**
 * Merge activities + stages into a single chronological timeline (newest first).
 * Stages use scheduledAt when present; otherwise createdAt.
 */
export function mergeTimeline(
  activities: TimelineActivity[],
  stages: TimelineStage[],
): TimelineItem[] {
  const combined: TimelineItem[] = [...activities, ...stages]
  combined.sort((a, b) => {
    const at = timestampOf(a)
    const bt = timestampOf(b)
    return bt - at
  })
  return combined
}

function timestampOf(item: TimelineItem): number {
  if (item.kind === 'stage' && item.scheduledAt) return new Date(item.scheduledAt).getTime()
  return new Date(item.createdAt).getTime()
}
