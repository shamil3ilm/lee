'use client'
import * as React from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { findItem, type BoardItem } from '@/lib/board/move'
import { focusRing } from '@/components/ui/focus-ring'
import { cn } from '@/lib/utils'
import {
  BoardCardFrame,
  BoardColumnBody,
  BoardColumnFrame,
  BoardGrid,
} from '@/components/board/board-view'
import type { BoardLayerProps } from '@/components/board/board'
import type { BoardColumnDef } from '@/components/board/types'

/**
 * Drag-and-drop layer of the generic board. Loaded after hydration by
 * `board.tsx` so @dnd-kit stays out of every page's first-load bundle.
 *
 * Sensors: mouse (4px threshold so clicks still open cards), touch (short
 * press so horizontal swipes keep scrolling the board) and keyboard (Space
 * to lift, arrow keys jump column to column, Space/Enter to drop, Escape to
 * cancel).
 */

export type BoardDndLayerProps<C extends string, T extends BoardItem> = BoardLayerProps<C, T>

const COLUMN_PREFIX = 'column:'
const columnDropId = (c: string): string => `${COLUMN_PREFIX}${c}`

/** Arrow keys move the lifted card to the next/previous column's centre. */
const columnJump: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const forward = event.code === 'ArrowRight' || event.code === 'ArrowDown'
  const backward = event.code === 'ArrowLeft' || event.code === 'ArrowUp'
  if (!forward && !backward) return undefined
  event.preventDefault()
  const { collisionRect, droppableRects, droppableContainers } = context
  if (!collisionRect) return currentCoordinates
  const cols: Array<{ id: UniqueIdentifier; left: number; width: number; top: number }> = []
  for (const container of droppableContainers.getEnabled()) {
    if (!String(container.id).startsWith(COLUMN_PREFIX)) continue
    const rect = droppableRects.get(container.id)
    if (rect) cols.push({ id: container.id, left: rect.left, width: rect.width, top: rect.top })
  }
  if (cols.length === 0) return currentCoordinates
  cols.sort((a, b) => a.left - b.left)
  const cx = collisionRect.left + collisionRect.width / 2
  let index = cols.findIndex((c) => cx >= c.left && cx <= c.left + c.width)
  if (index < 0) {
    index = cols.reduce(
      (best, c, i) => (Math.abs(c.left + c.width / 2 - cx) < Math.abs(cols[best]!.left + cols[best]!.width / 2 - cx) ? i : best),
      0,
    )
  }
  const target = cols[index + (forward ? 1 : -1)]
  if (!target) return currentCoordinates
  return {
    x: currentCoordinates.x + (target.left + target.width / 2 - cx),
    y: currentCoordinates.y + (target.top + 56 - collisionRect.top),
  }
}

/** Pointer position first (precise for mouse/touch), rectangles for keyboard. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}

function columnOf(id: UniqueIdentifier | undefined | null): string | null {
  if (id === undefined || id === null) return null
  const s = String(id)
  return s.startsWith(COLUMN_PREFIX) ? s.slice(COLUMN_PREFIX.length) : null
}

export function BoardDndLayer<C extends string, T extends BoardItem>(props: BoardDndLayerProps<C, T>) {
  const { id, label, columns, grouped, onMoveTo, itemLabel } = props
  const columnIds = React.useMemo(() => columns.map((c) => c.id), [columns])
  const [active, setActive] = React.useState<{ item: T; column: C } | null>(null)

  // Stable id for dnd-kit's aria-describedby ids (its internal counter
  // differs between server and client render passes).
  const dndId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnJump }),
  )

  const titleOf = React.useCallback(
    (c: string | null): string => columns.find((d) => d.id === c)?.title ?? 'no column',
    [columns],
  )
  const labelOf = React.useCallback(
    (itemId: UniqueIdentifier): string => {
      const found = findItem(grouped, columnIds, String(itemId))
      return found ? itemLabel(found.item) : 'card'
    },
    [columnIds, grouped, itemLabel],
  )

  const onDragStart = (e: DragStartEvent): void => {
    setActive(findItem(grouped, columnIds, String(e.active.id)))
  }

  const onDragEnd = (e: DragEndEvent): void => {
    setActive(null)
    const to = columnOf(e.over?.id)
    if (!to) return
    onMoveTo(String(e.active.id), to as C)
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'To move this card, press Space. Use the arrow keys to pick a column, then press Space again to drop it there, or Escape to cancel. The actions menu also has Move to options.',
        },
        announcements: {
          onDragStart: ({ active: a }) => `Picked up ${labelOf(a.id)}.`,
          onDragOver: ({ active: a, over }) =>
            over ? `${labelOf(a.id)} is over ${titleOf(columnOf(over.id))}.` : `${labelOf(a.id)} is not over a column.`,
          onDragEnd: ({ active: a, over }) =>
            over ? `Dropped ${labelOf(a.id)} in ${titleOf(columnOf(over.id))}.` : `${labelOf(a.id)} was dropped outside the board.`,
          onDragCancel: ({ active: a }) => `Cancelled. ${labelOf(a.id)} stays where it was.`,
        },
      }}
    >
      <BoardGrid id={id} label={label}>
        {columns.map((def) => (
          <DroppableColumn key={def.id} props={props} def={def} />
        ))}
      </BoardGrid>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <BoardCardFrame
            label={itemLabel(active.item)}
            isOverlay
            column={active.column}
            columns={columns}
          >
            {props.renderCard(active.item, { column: active.column, isOverlay: true })}
          </BoardCardFrame>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function DroppableColumn<C extends string, T extends BoardItem>({
  props,
  def,
}: {
  props: BoardDndLayerProps<C, T>
  def: BoardColumnDef<C>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(def.id) })
  const cards = props.grouped[def.id] ?? []
  const total = props.totals?.[def.id]
  return (
    <BoardColumnFrame
      boardId={props.id}
      def={def}
      count={cards.length}
      total={total}
      isOver={isOver}
      columnRef={setNodeRef}
      footer={props.columnFooter?.(def.id, cards.length, total ?? cards.length)}
    >
      <BoardColumnBody empty={cards.length === 0} emptyText={def.emptyText}>
        {cards.map((item) => (
          <DraggableCard key={item.id} props={props} item={item} column={def.id} />
        ))}
      </BoardColumnBody>
    </BoardColumnFrame>
  )
}

function DraggableCard<C extends string, T extends BoardItem>({
  props,
  item,
  column,
}: {
  props: BoardDndLayerProps<C, T>
  item: T
  column: C
}) {
  // The DragOverlay follows the pointer; the original stays in place, dimmed.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })
  const name = props.itemLabel(item)
  const style: React.CSSProperties = { opacity: isDragging ? 0.4 : 1 }
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-board-card={item.id}
      {...attributes}
      {...listeners}
      aria-label={name}
      className={cn('cursor-grab touch-manipulation rounded-lg', focusRing)}
    >
      <BoardCardFrame
        label={name}
        href={props.cardHref?.(item)}
        column={column}
        columns={props.columns}
        onMoveTo={(to) => props.onMoveTo(item.id, to)}
        actions={props.cardActions?.(item, column)}
      >
        {props.renderCard(item, { column, isOverlay: false })}
      </BoardCardFrame>
    </div>
  )
}
