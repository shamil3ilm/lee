'use client'
import * as React from 'react'
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
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/ui/status'
import {
  KanbanBoardGrid,
  KanbanCardView,
  KanbanColumnBody,
  KanbanColumnFrame,
  type GroupedCards,
  type KanbanCard,
} from '@/components/kanban-view'

/**
 * Drag-and-drop layer of the dashboard kanban. Loaded after hydration by
 * `kanban.tsx` so @dnd-kit stays out of the dashboard's first-load bundle.
 */

function findStatusOfCard(grouped: GroupedCards, cardId: string): ApplicationStatus | null {
  for (const s of APPLICATION_STATUSES) {
    if (grouped[s].some((c) => c.id === cardId)) return s
  }
  return null
}

export interface KanbanDndBoardProps {
  grouped: GroupedCards
  onMove: (cardId: string, from: ApplicationStatus, to: ApplicationStatus) => void
}

export function KanbanDndBoard({ grouped, onMove }: KanbanDndBoardProps) {
  const [activeCard, setActiveCard] = React.useState<KanbanCard | null>(null)

  // Stable id for dnd-kit's aria-describedby ids (its internal counter
  // differs per render pass).
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
    onMove(cardId, fromStatus, toStatus)
  }

  return (
    <DndContext id={dndId} sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <KanbanBoardGrid>
        {APPLICATION_STATUSES.map((status) => (
          <DroppableColumn key={status} status={status} cards={grouped[status]} />
        ))}
      </KanbanBoardGrid>
      <DragOverlay dropAnimation={null}>
        {activeCard ? <KanbanCardView card={activeCard} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

interface DroppableColumnProps {
  status: ApplicationStatus
  cards: KanbanCard[]
}

function DroppableColumn({ status, cards }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <KanbanColumnFrame status={status} count={cards.length} isOver={isOver} columnRef={setNodeRef}>
      <SortableContext
        id={status}
        items={cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <KanbanColumnBody empty={cards.length === 0}>
          {cards.map((c) => (
            <SortableCard key={c.id} card={c} />
          ))}
        </KanbanColumnBody>
      </SortableContext>
    </KanbanColumnFrame>
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
