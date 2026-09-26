'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Activity as ActivityIcon,
  ArrowRightLeft,
  Calendar,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Sparkles,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import { setStageStatus } from '@/app/(authed)/applications/[id]/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DebriefDialog } from '@/components/debrief-dialog'
import { StageActions } from '@/components/stage-actions'
import { relativeFromNow, shortDateTime } from '@/lib/ui/date'
import { STATUS_BADGE, STATUS_LABELS, type ApplicationStatus } from '@/lib/ui/status'
import type { TimelineActivity, TimelineItem, TimelineStage } from '@/lib/ui/timeline'

export type { TimelineActivity, TimelineItem, TimelineStage } from '@/lib/ui/timeline'

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
        ) : item.activityKind === 'email' ? (
          <EmailActivityItem key={`a-${item.id}`} item={item} />
        ) : (
          <ActivityItem key={`a-${item.id}`} item={item} />
        ),
      )}
    </ol>
  )
}

function StageItem({ item }: { item: TimelineStage }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [debriefOpen, setDebriefOpen] = useState(false)
  const label = item.title || STAGE_KIND_LABELS[item.stageKind] || item.stageKind
  const inCalendar = Boolean(item.googleEventId)
  const canPush = !inCalendar && Boolean(item.scheduledAt)
  const isCompleted = item.status === 'completed'
  const hasDebriefNotes = Boolean(item.debriefNotesMd && item.debriefNotesMd.trim().length > 0)
  const hasAIDebrief = Boolean(item.debriefDocId)

  function pushToCalendar(): void {
    start(async () => {
      try {
        // v9 — send what the client believed the stage state was so the
        // server can 409 if another tab already pushed or rescheduled.
        const res = await fetch(`/api/stages/${item.id}/push-to-calendar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedGoogleEventId: item.googleEventId ?? null,
            expectedScheduledAt: item.scheduledAt ?? null,
          }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          success?: boolean
          conflict?: string
          message?: string
        }
        if (res.status === 409) {
          toast(json.message ?? 'Stage changed since you opened the page.')
          router.refresh()
          return
        }
        if (!res.ok || !json.success) {
          if (res.status === 400 || res.status === 401) {
            toast.error(json.error ?? 'Connect Google at Settings → Integrations.')
          } else {
            toast.error(json.error ?? 'Could not push to calendar.')
          }
          return
        }
        toast.success('Pushed to calendar')
        router.refresh()
      } catch {
        toast.error('Could not reach the calendar endpoint.')
      }
    })
  }

  function removeFromCalendar(): void {
    start(async () => {
      try {
        const res = await fetch(`/api/stages/${item.id}/remove-from-calendar`, { method: 'DELETE' })
        const json = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean }
        if (!res.ok || !json.success) {
          toast.error(json.error ?? 'Could not remove from calendar.')
          return
        }
        toast.success('Removed from calendar')
        router.refresh()
      } catch {
        toast.error('Could not reach the calendar endpoint.')
      }
    })
  }

  return (
    <li className="rounded-md border bg-card p-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded bg-stage-interview-soft p-1.5 text-stage-interview">
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
              <StageActions
                stageId={item.id}
                label={label}
                inCalendar={inCalendar}
                initial={{
                  stageKind: item.stageKind,
                  title: item.title,
                  scheduledAt: item.scheduledAt,
                  durationMinutes: item.durationMinutes ?? null,
                  location: item.location ?? null,
                  meetingUrl: item.meetingUrl ?? null,
                  prepNotesMd: item.prepNotesMd,
                }}
              />
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

          {/* Mark-complete: shown for stages that haven't reached a terminal
              status yet so the user can flip to 'completed' and unlock the
              debrief affordance. Kept separate from calendar controls because
              cancelling/no-showing is out of scope for this button. */}
          {!isCompleted && item.status !== 'cancelled' && item.status !== 'no_show' ? (
            <div className="mt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  start(async () => {
                    const res = await setStageStatus(item.id, 'completed')
                    if ('success' in res) {
                      toast.success('Stage marked complete')
                      router.refresh()
                    } else {
                      toast.error(res.error)
                    }
                  })
                }
                disabled={pending}
              >
                {pending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                Mark complete
              </Button>
            </div>
          ) : null}

          {/* v4.3 — post-stage debrief. Only offered on completed stages so
              the affordance doesn't nag before the interview happens. The
              modal is controlled from here so the chip and the trigger can
              live in the same row without duplicating the button visual. */}
          {isCompleted ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {hasDebriefNotes ? (
                <>
                  <Badge variant="emerald" className="text-[10px]">
                    <CheckCircle2 className="mr-1 size-3" /> Debrief added
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDebriefOpen(true)}
                  >
                    Edit
                  </Button>
                  {hasAIDebrief ? (
                    <Button
                      asChild
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                    >
                      <Link
                        href={`/api/documents/${item.debriefDocId}/pdf`}
                        target="_blank"
                      >
                        <Download className="size-3" />
                        AI summary
                      </Link>
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Sparkles className="size-3" />
                      AI summary not yet generated
                    </span>
                  )}
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setDebriefOpen(true)}
                >
                  + Add debrief
                </Button>
              )}
              <DebriefDialog
                stageId={item.id}
                stageLabel={label}
                initialNotes={item.debriefNotesMd}
                existingDebriefDocId={item.debriefDocId ?? null}
                triggerVariant={hasDebriefNotes ? 'edit' : 'add'}
                open={debriefOpen}
                onOpenChange={setDebriefOpen}
              />
            </div>
          ) : null}

          {/* Calendar push controls — only meaningful when the stage has a
              scheduled time. An unscheduled stage cannot land on a calendar. */}
          {(inCalendar || canPush) ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {inCalendar ? (
                <>
                  <Badge variant="emerald" className="text-[10px]">
                    <CheckCircle2 className="mr-1 size-3" /> In Calendar
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={removeFromCalendar}
                    disabled={pending}
                  >
                    {pending ? <Loader2 className="size-3 animate-spin" /> : <CalendarX className="size-3" />}
                    Remove from calendar
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={pushToCalendar}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="size-3 animate-spin" /> : <CalendarPlus className="size-3" />}
                  Push to calendar
                </Button>
              )}
            </div>
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

interface EmailPayload {
  threadId?: string
  from?: string
  subject?: string
  snippet?: string
  matchReason?: string
}

function isEmailPayload(payload: unknown): payload is EmailPayload {
  return typeof payload === 'object' && payload !== null
}

function EmailActivityItem({ item }: { item: TimelineActivity }) {
  const p = isEmailPayload(item.payload) ? item.payload : {}
  const snippet = p.snippet ? p.snippet.slice(0, 200) : null
  return (
    <li className="rounded-md border bg-card p-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded bg-info-soft p-1.5 text-info">
          <Mail className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted-foreground">
                From: <span className="text-foreground/80">{p.from ?? 'Unknown sender'}</span>
              </div>
              <div className="mt-0.5 truncate font-medium">
                {p.subject ?? '(no subject)'}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {p.matchReason ? (
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {p.matchReason.replace(/_/g, ' ')}
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {shortDateTime(item.createdAt)}
              </span>
            </div>
          </div>
          {snippet ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {snippet}
              {p.snippet && p.snippet.length > 200 ? '…' : ''}
            </p>
          ) : null}
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
