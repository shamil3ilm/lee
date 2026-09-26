'use client'
import * as React from 'react'
import { ExternalLink } from 'lucide-react'
import { changeApplicationStatus } from '@/app/(authed)/actions'
import { Board, type BoardColumnDef } from '@/components/board/board'
import { InterestStars } from '@/components/interest-stars'
import { Badge } from '@/components/ui/badge'
import { isWithinDays, relativeFromNow } from '@/lib/ui/date'
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  STATUS_TONE,
  type ApplicationStatus,
} from '@/lib/ui/status'

export interface KanbanCard {
  id: string
  title: string
  companyName: string | null
  interestLevel: number | null
  nextActionAt: string | null
}

export interface KanbanColumn {
  status: ApplicationStatus
  cards: KanbanCard[]
}

interface KanbanProps {
  columns: KanbanColumn[]
}

const COLUMNS: readonly BoardColumnDef<ApplicationStatus>[] = APPLICATION_STATUSES.map((status) => ({
  id: status,
  title: STATUS_LABELS[status],
  tone: STATUS_TONE[status],
  emptyText: 'No applications',
}))

function toGrouped(columns: KanbanColumn[]): Record<ApplicationStatus, KanbanCard[]> {
  const grouped = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, [] as KanbanCard[]])) as Record<
    ApplicationStatus,
    KanbanCard[]
  >
  for (const c of columns) grouped[c.status] = [...c.cards]
  return grouped
}

function itemLabel(card: KanbanCard): string {
  return `${card.companyName ?? 'Unknown'} — ${card.title}`
}

function renderCard(card: KanbanCard): React.ReactNode {
  return (
    <>
      <div className="font-medium leading-tight">{card.companyName ?? 'Unknown'}</div>
      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{card.title}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
        <InterestStars level={card.interestLevel} />
        {card.nextActionAt && isWithinDays(card.nextActionAt, 7) ? (
          <Badge variant="outline" className="shrink-0 whitespace-nowrap text-[10px]">
            {relativeFromNow(card.nextActionAt)}
          </Badge>
        ) : null}
      </div>
    </>
  )
}

const cardHref = (card: KanbanCard): string => `/applications/${card.id}`
const cardActions = (card: KanbanCard) => [
  { label: 'Open application', icon: ExternalLink, href: `/applications/${card.id}` },
]
const onMove = (card: KanbanCard, _from: ApplicationStatus, to: ApplicationStatus) =>
  changeApplicationStatus(card.id, to)
const successMessage = (_card: KanbanCard, to: BoardColumnDef<ApplicationStatus>): string =>
  `Moved to ${to.title}`

/**
 * Applications pipeline board (dashboard and /applications?view=board), on
 * the generic board: static first paint, drag-and-drop after hydration,
 * optimistic moves persisted by `changeApplicationStatus`.
 */
export function Kanban({ columns }: KanbanProps) {
  const items = React.useMemo(() => toGrouped(columns), [columns])
  return (
    <Board
      id="applications"
      label="Applications pipeline board"
      columns={COLUMNS}
      items={items}
      itemLabel={itemLabel}
      renderCard={renderCard}
      cardHref={cardHref}
      cardActions={cardActions}
      onMove={onMove}
      successMessage={successMessage}
    />
  )
}
