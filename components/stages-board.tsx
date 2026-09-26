'use client'
import * as React from 'react'
import { CalendarClock, Video } from 'lucide-react'
import { setStageStatus } from '@/app/(authed)/applications/[id]/actions'
import { Board, type BoardColumnDef, type BoardQuickAction } from '@/components/board/board'
import { Badge } from '@/components/ui/badge'
import { groupBy } from '@/lib/board/move'
import { STAGE_KINDS } from '@/lib/stages/kinds'
import {
  STAGE_BOARD_COLUMNS,
  STAGE_STATUS_LABELS,
  STAGE_STATUS_TONE,
  stageBoardColumn,
  type StageBoardColumn,
} from '@/lib/stages/status'
import { DISPLAY_LOCALE } from '@/lib/ui/date'

export interface StageBoardItem {
  id: string
  version: string
  kind: string
  title: string | null
  status: string
  scheduledAt: string | null
  meetingUrl: string | null
}

const COLUMNS: readonly BoardColumnDef<StageBoardColumn>[] = STAGE_BOARD_COLUMNS.map((c) => ({
  id: c,
  title: STAGE_STATUS_LABELS[c],
  tone: STAGE_STATUS_TONE[c],
  emptyText: c === 'scheduled' ? 'Nothing booked' : 'None',
}))

const KIND_LABEL = new Map<string, string>(STAGE_KINDS.map((k) => [k.value, k.label]))

function label(s: StageBoardItem): string {
  return s.title ?? KIND_LABEL.get(s.kind) ?? s.kind
}

function renderCard(s: StageBoardItem): React.ReactNode {
  return (
    <>
      <div className="font-medium leading-tight">{label(s)}</div>
      {s.title ? (
        <div className="mt-0.5 text-xs text-muted-foreground">{KIND_LABEL.get(s.kind) ?? s.kind}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {s.scheduledAt ? (
          <span className="inline-flex items-center gap-1" suppressHydrationWarning>
            <CalendarClock className="size-3" aria-hidden="true" />
            {new Date(s.scheduledAt).toLocaleString(DISPLAY_LOCALE, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        ) : (
          <span>Not scheduled</span>
        )}
        {s.status === 'no_show' ? (
          <Badge variant={STAGE_STATUS_TONE.no_show} className="text-[10px]">
            {STAGE_STATUS_LABELS.no_show}
          </Badge>
        ) : null}
      </div>
    </>
  )
}

function cardActions(s: StageBoardItem): BoardQuickAction[] {
  return s.meetingUrl
    ? [{ label: 'Join meeting', icon: Video, href: s.meetingUrl, external: true }]
    : []
}

/** Interview stages of one application: Scheduled / Done / Cancelled. */
export function StagesBoard({ stages }: { stages: StageBoardItem[] }) {
  const items = React.useMemo(
    () => groupBy(stages, STAGE_BOARD_COLUMNS, (s) => stageBoardColumn(s.status)),
    [stages],
  )
  return (
    <Board
      id="stages"
      label="Interview stages board"
      columns={COLUMNS}
      items={items}
      itemLabel={label}
      renderCard={renderCard}
      cardActions={cardActions}
      applyMove={(s, to) => ({ ...s, status: to })}
      onMove={(s, _from, to) => setStageStatus(s.id, to)}
    />
  )
}
