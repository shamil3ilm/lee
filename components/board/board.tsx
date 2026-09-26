'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { findItem, groupedKey, moveItem, type BoardItem, type Grouped } from '@/lib/board/move'
import {
  BoardCardFrame,
  BoardColumnBody,
  BoardColumnFrame,
  BoardGrid,
} from '@/components/board/board-view'
import type { BoardDndLayerProps } from '@/components/board/board-dnd'
import type { BoardColumnDef, BoardProps } from '@/components/board/types'

export type { BoardColumnDef, BoardProps, BoardQuickAction, MoveResult } from '@/components/board/types'

type DndLayer = React.ComponentType<BoardDndLayerProps<string, BoardItem>>

/**
 * Generic kanban board. First paint (and the server render) is the static
 * board: cards link through and the quick-actions menu can already move
 * them. @dnd-kit is only needed once someone drags, so the drag layer loads
 * after hydration instead of shipping in the page's first-load bundle.
 *
 * Moves are optimistic: the card jumps immediately, the server action runs,
 * and a failure puts the card back with a friendly toast. Every outcome is
 * announced in a polite live region.
 */
export function Board<C extends string, T extends BoardItem>(props: BoardProps<C, T>) {
  const { columns, items, onMove, canMove, applyMove, successMessage } = props
  const columnIds = React.useMemo(() => columns.map((c) => c.id), [columns])

  // Reset local state when the server sends different data (revalidate),
  // using the "derived state" pattern: compare during render, no effect.
  const serverKey = groupedKey(items as Grouped<C, T>, columnIds)
  const [grouped, setGrouped] = React.useState<Grouped<C, T>>(items)
  const [lastKey, setLastKey] = React.useState(serverKey)
  if (serverKey !== lastKey) {
    setLastKey(serverKey)
    setGrouped(items)
  }

  const [announcement, setAnnouncement] = React.useState('')
  // Latest grouping for async callbacks (rollback must restore the state
  // from before *this* move, not a stale closure).
  const groupedRef = React.useRef(grouped)
  React.useEffect(() => {
    groupedRef.current = grouped
  }, [grouped])

  const [DndLayer, setDndLayer] = React.useState<DndLayer | null>(null)
  React.useEffect(() => {
    let cancelled = false
    import('@/components/board/board-dnd')
      .then((m) => {
        if (!cancelled) setDndLayer(() => m.BoardDndLayer as unknown as DndLayer)
      })
      .catch((err: unknown) => {
        // The static board stays usable (links + Move to menu); only
        // dragging is unavailable until the next navigation.
        console.error('board: failed to load drag-and-drop', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const columnDef = React.useCallback(
    (c: C): BoardColumnDef<C> => columns.find((d) => d.id === c) ?? columns[0]!,
    [columns],
  )

  const move = React.useCallback(
    (itemId: string, to: C): void => {
      const found = findItem(groupedRef.current, columnIds, itemId)
      if (!found || found.column === to) return
      const { item, column: from } = found
      const name = props.itemLabel(item)
      const toDef = columnDef(to)
      const fromDef = columnDef(from)

      const veto = canMove?.(item, from, to) ?? null
      if (veto) {
        toast.error(veto)
        setAnnouncement(`${name} stays in ${fromDef.title}. ${veto}`)
        return
      }

      const previous = groupedRef.current
      const next = moveItem(previous, itemId, from, to, applyMove)
      groupedRef.current = next
      setGrouped(next)
      setAnnouncement(`Moving ${name} to ${toDef.title}…`)

      void (async () => {
        let result: Awaited<ReturnType<typeof onMove>>
        try {
          result = await onMove(item, from, to)
        } catch {
          result = { error: 'Could not reach the server.' }
        }
        if ('error' in result) {
          // Roll back just this card: later moves of other cards stay.
          const current = groupedRef.current
          const where = findItem(current, columnIds, itemId)
          const rolledBack = where ? moveItem(current, itemId, where.column, from, () => item) : previous
          groupedRef.current = rolledBack
          setGrouped(rolledBack)
          toast.error(`Couldn't move ${name}: ${result.error} It's back in ${fromDef.title}.`)
          setAnnouncement(`Couldn't move ${name}. It's back in ${fromDef.title}.`)
        } else {
          toast.success(successMessage ? successMessage(item, toDef) : `Moved to ${toDef.title}`)
          setAnnouncement(`Moved ${name} to ${toDef.title}.`)
        }
      })()
    },
    [applyMove, canMove, columnDef, columnIds, onMove, props, successMessage],
  )

  return (
    <div className={props.className}>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {DndLayer ? (
        <DndLayer
          {...(props as unknown as BoardDndLayerProps<string, BoardItem>)}
          grouped={grouped as unknown as Grouped<string, BoardItem>}
          onMoveTo={move as unknown as (itemId: string, to: string) => void}
        />
      ) : (
        <StaticBoard {...props} grouped={grouped} onMoveTo={move} />
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Drag cards between columns or use a card&apos;s menu. With a keyboard: focus a card, press
        Space, choose a column with the arrow keys, press Space again.
      </p>
    </div>
  )
}

export interface BoardLayerProps<C extends string, T extends BoardItem> extends BoardProps<C, T> {
  grouped: Grouped<C, T>
  onMoveTo: (itemId: string, to: C) => void
}

/** The board without drag-and-drop: server render, first paint, fallback. */
function StaticBoard<C extends string, T extends BoardItem>(props: BoardLayerProps<C, T>) {
  const { id, label, columns, grouped, totals, columnFooter, onMoveTo } = props
  return (
    <BoardGrid id={id} label={label}>
      {columns.map((def) => {
        const cards = grouped[def.id] ?? []
        const total = totals?.[def.id]
        return (
          <BoardColumnFrame
            key={def.id}
            boardId={id}
            def={def}
            count={cards.length}
            total={total}
            footer={columnFooter?.(def.id, cards.length, total ?? cards.length)}
          >
            <BoardColumnBody empty={cards.length === 0} emptyText={def.emptyText}>
              {cards.map((item) => (
                <div key={item.id} data-board-card={item.id}>
                  <BoardCardFrame
                    label={props.itemLabel(item)}
                    href={props.cardHref?.(item)}
                    column={def.id}
                    columns={columns}
                    onMoveTo={(to) => onMoveTo(item.id, to)}
                    actions={props.cardActions?.(item, def.id)}
                  >
                    {props.renderCard(item, { column: def.id, isOverlay: false })}
                  </BoardCardFrame>
                </div>
              ))}
            </BoardColumnBody>
          </BoardColumnFrame>
        )
      })}
    </BoardGrid>
  )
}
