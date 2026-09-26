'use client'
import * as React from 'react'
import { toast } from 'sonner'
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from '@/lib/ui/status'
import { changeApplicationStatus } from '@/app/(authed)/actions'
import { StaticKanbanBoard, type GroupedCards, type KanbanCard } from '@/components/kanban-view'
import type { KanbanDndBoardProps } from '@/components/kanban-dnd'

export type { KanbanCard } from '@/components/kanban-view'

export interface KanbanColumn {
  status: ApplicationStatus
  cards: KanbanCard[]
}

interface KanbanProps {
  columns: KanbanColumn[]
}

type DndBoard = React.ComponentType<KanbanDndBoardProps>

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

/**
 * Dashboard pipeline board. First paint (and the server render) is the
 * static board: cards are plain links. Drag-and-drop needs @dnd-kit, which
 * is only useful once the user starts a drag, so it loads after hydration
 * instead of shipping in the dashboard's first-load bundle.
 */
export function Kanban({ columns }: KanbanProps) {
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

  const [DndBoard, setDndBoard] = React.useState<DndBoard | null>(null)
  React.useEffect(() => {
    let cancelled = false
    import('@/components/kanban-dnd')
      .then((m) => {
        if (!cancelled) setDndBoard(() => m.KanbanDndBoard)
      })
      .catch((err: unknown) => {
        // The static board stays usable (cards still link through); only
        // drag-to-move is unavailable until the next navigation.
        console.error('kanban: failed to load drag-and-drop', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const moveCard = (cardId: string, fromStatus: ApplicationStatus, toStatus: ApplicationStatus): void => {
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

  if (!DndBoard) return <StaticKanbanBoard grouped={grouped} />
  return <DndBoard grouped={grouped} onMove={moveCard} />
}
