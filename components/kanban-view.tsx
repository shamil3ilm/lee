'use client'
import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { InterestStars } from '@/components/interest-stars'
import { cn } from '@/lib/utils'
import { isWithinDays, relativeFromNow } from '@/lib/ui/date'
import {
  APPLICATION_STATUSES,
  STATUS_ACCENT,
  STATUS_LABELS,
  type ApplicationStatus,
} from '@/lib/ui/status'

/**
 * Presentational pieces of the dashboard kanban, free of @dnd-kit. The static
 * board renders on the server and for first paint; `kanban-dnd.tsx` reuses
 * the same pieces once the drag-and-drop chunk has loaded, so the swap is
 * visually identical.
 */

export interface KanbanCard {
  id: string
  title: string
  companyName: string | null
  interestLevel: number | null
  nextActionAt: string | null
}

export type GroupedCards = Record<ApplicationStatus, KanbanCard[]>

export function KanbanBoardGrid({ children }: { children: React.ReactNode }) {
  return (
    // Responsive layout:
    // - <md (mobile): horizontal snap scroll, columns 85vw wide
    // - md 2 cols wrap, lg 4 cols wrap, xl+ 7 cols evenly
    <div
      className={cn(
        'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2',
        'md:grid md:snap-none md:overflow-visible md:grid-cols-2 md:pb-0',
        'lg:grid-cols-4',
        'xl:grid-cols-7',
      )}
    >
      {children}
    </div>
  )
}

interface KanbanColumnFrameProps {
  status: ApplicationStatus
  count: number
  isOver?: boolean
  columnRef?: (element: HTMLElement | null) => void
  children: React.ReactNode
}

export function KanbanColumnFrame({ status, count, isOver, columnRef, children }: KanbanColumnFrameProps) {
  return (
    <div
      ref={columnRef}
      className={cn(
        // Mobile: fixed-width snap child. md+ (grid parent): auto width, min-height for uniformity.
        'flex flex-col rounded-lg border bg-muted/30 transition-colors',
        'w-[85vw] shrink-0 snap-start',
        'md:w-auto md:shrink md:snap-align-none',
        isOver && 'border-primary/60 bg-accent/60',
      )}
    >
      <div className="sticky top-0 z-[1] flex items-center justify-between rounded-t-lg border-b bg-muted/60 px-3 py-2 backdrop-blur">
        <div
          className={cn(
            'text-xs font-semibold uppercase tracking-wide',
            STATUS_ACCENT[status],
          )}
        >
          {STATUS_LABELS[status]}
        </div>
        <span className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </div>
  )
}

export function KanbanColumnBody({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
      {empty ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Drop here
        </div>
      ) : (
        children
      )}
    </div>
  )
}

interface KanbanCardViewProps {
  card: KanbanCard
  isOverlay?: boolean
}

export function KanbanCardView({ card, isOverlay }: KanbanCardViewProps) {
  // In the overlay we render a static card (no link) so pointer events don't
  // fight the drag. In the sortable position we render a Link so keyboard
  // users can still open the app, and mouse users get click-to-open when the
  // drag threshold isn't reached.
  const inner = (
    <div
      className={cn(
        'block rounded-md border bg-card p-3 text-sm shadow-sm transition-all',
        isOverlay
          ? 'cursor-grabbing shadow-lg ring-2 ring-primary/30'
          : 'cursor-grab hover:border-primary/50 hover:shadow-md',
      )}
    >
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
    </div>
  )
  if (isOverlay) return inner
  return (
    <Link
      href={`/applications/${card.id}`}
      onClick={(e) => {
        // Prevent navigation when the click follows a drag (dnd-kit already
        // suppresses this, but be defensive: if the modifier keys are held or
        // the target is the drag handle mid-motion, just let it through).
        if (e.defaultPrevented) e.preventDefault()
      }}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background block rounded-md"
    >
      {inner}
    </Link>
  )
}

/** The board without drag-and-drop: server render, first paint, and fallback. */
export function StaticKanbanBoard({ grouped }: { grouped: GroupedCards }) {
  return (
    <KanbanBoardGrid>
      {APPLICATION_STATUSES.map((status) => (
        <KanbanColumnFrame key={status} status={status} count={grouped[status].length}>
          <KanbanColumnBody empty={grouped[status].length === 0}>
            {grouped[status].map((c) => (
              <div key={c.id}>
                <KanbanCardView card={c} />
              </div>
            ))}
          </KanbanColumnBody>
        </KanbanColumnFrame>
      ))}
    </KanbanBoardGrid>
  )
}
