'use client'
import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import { changeApplicationStatus } from '@/app/(authed)/actions'

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

type GroupedCards = Record<ApplicationStatus, KanbanCard[]>

function toGrouped(columns: KanbanColumn[]): GroupedCards {
  const grouped: GroupedCards = {
    saved: [],
    applied: [],
    screen: [],
    interview: [],
    offer: [],
    rejected: [],
    withdrawn: [],
  }
  for (const s of APPLICATION_STATUSES) {
    const found = columns.find((c) => c.status === s)
    grouped[s] = found ? [...found.cards] : []
  }
  return grouped
}

function findStatusOfCard(grouped: GroupedCards, cardId: string): ApplicationStatus | null {
  for (const s of APPLICATION_STATUSES) {
    if (grouped[s].some((c) => c.id === cardId)) return s
  }
  return null
}

export function Kanban({ columns }: KanbanProps) {
  const [activeCard, setActiveCard] = React.useState<KanbanCard | null>(null)

  // If the parent re-renders (revalidate) with a different card layout, reset
  // local state to match. Uses the "derived state" pattern from the React
  // docs: track the last-seen prop signature and setState during render — no
  // effect required, no cascading render.
  const columnsKey = React.useMemo(
    () => columns.map((c) => `${c.status}:${c.cards.map((x) => x.id).join(',')}`).join('|'),
    [columns],
  )
  const [grouped, setGrouped] = React.useState<GroupedCards>(() => toGrouped(columns))
  const [lastKey, setLastKey] = React.useState(columnsKey)
  if (columnsKey !== lastKey) {
    setLastKey(columnsKey)
    setGrouped(toGrouped(columns))
  }

  // Stable id so dnd-kit's aria-describedby ids match between SSR and
  // hydration (its internal counter differs per render pass).
  const dndId = React.useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const onDragStart = (e: DragStartEvent): void => {
    const id = String(e.active.id)
    const status = findStatusOfCard(grouped, id)
    if (!status) return
    const card = grouped[status].find((c) => c.id === id) ?? null
    setActiveCard(card)
  }

  const onDragEnd = (e: DragEndEvent): void => {
    setActiveCard(null)
    const { active, over } = e
    if (!over) return
    const cardId = String(active.id)
    const fromStatus = findStatusOfCard(grouped, cardId)
    if (!fromStatus) return
    // The droppable is the column; its id is the status string. If a card is
    // dropped on another card, `over.id` will be that card's id — resolve it
    // to the column that owns it.
    const overId = String(over.id)
    const toStatus =
      (APPLICATION_STATUSES as readonly string[]).includes(overId)
        ? (overId as ApplicationStatus)
        : findStatusOfCard(grouped, overId)
    if (!toStatus || toStatus === fromStatus) return

    const card = grouped[fromStatus].find((c) => c.id === cardId)
    if (!card) return

    const previous = grouped
    const next: GroupedCards = { ...grouped }
    next[fromStatus] = grouped[fromStatus].filter((c) => c.id !== cardId)
    next[toStatus] = [card, ...grouped[toStatus]]
    setGrouped(next)

    // Persist. Revert on failure.
    void (async () => {
      const result = await changeApplicationStatus(cardId, toStatus)
      if ('error' in result) {
        setGrouped(previous)
        toast.error(result.error)
      } else {
        toast.success(`Moved to ${STATUS_LABELS[toStatus]}`)
      }
    })()
  }

  return (
    <DndContext id={dndId} sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {/*
        Responsive layout:
        - <md (mobile): horizontal snap scroll, columns 85vw wide
        - md 2 cols wrap, lg 4 cols wrap, xl+ 7 cols evenly
      */}
      <div
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2',
          'md:grid md:snap-none md:overflow-visible md:grid-cols-2 md:pb-0',
          'lg:grid-cols-4',
          'xl:grid-cols-7',
        )}
      >
        {APPLICATION_STATUSES.map((status) => (
          <KanbanColumnView key={status} status={status} cards={grouped[status]} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeCard ? <KanbanCardView card={activeCard} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

interface KanbanColumnViewProps {
  status: ApplicationStatus
  cards: KanbanCard[]
}

function KanbanColumnView({ status, cards }: KanbanColumnViewProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
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
          {cards.length}
        </span>
      </div>
      <SortableContext
        id={status}
        items={cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
          {cards.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
              Drop here
            </div>
          ) : (
            cards.map((c) => <SortableCard key={c.id} card={c} />)
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableCard({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCardView card={card} />
    </div>
  )
}

interface KanbanCardViewProps {
  card: KanbanCard
  isOverlay?: boolean
}

function KanbanCardView({ card, isOverlay }: KanbanCardViewProps) {
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
