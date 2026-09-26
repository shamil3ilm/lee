import type * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import type { BoardItem } from '@/lib/board/move'
import type { Tone } from '@/lib/ui/tones'

export type { BoardItem } from '@/lib/board/move'

export interface BoardColumnDef<C extends string> {
  id: C
  title: string
  /** Status tone: column title colour and header accent. */
  tone: Tone
  /** Soft work-in-progress limit; the header warns when exceeded. */
  wipLimit?: number
  /** One-line explanation shown as the column's description. */
  hint?: string
  /** Start collapsed until the viewer expands it (remembered per board). */
  defaultCollapsed?: boolean
  /** Copy for the empty column. */
  emptyText?: string
}

export type MoveResult = { success: true } | { error: string }

export interface BoardQuickAction {
  label: string
  icon?: LucideIcon
  /** Either navigate… */
  href?: string
  external?: boolean
  /** …or run a handler. */
  onSelect?: () => void
  destructive?: boolean
}

export interface BoardCardContext<C extends string> {
  column: C
  isOverlay: boolean
}

export interface BoardConfig<C extends string, T extends BoardItem> {
  /** Stable id: storage keys, dnd ids, test ids. */
  id: string
  /** Accessible name of the board region, e.g. "Todos board". */
  label: string
  columns: readonly BoardColumnDef<C>[]
  /** Short human label of an item for announcements and menus. */
  itemLabel: (item: T) => string
  /** The card body. Keep it presentational; the frame adds drag + actions. */
  renderCard: (item: T, ctx: BoardCardContext<C>) => React.ReactNode
  /** Makes the card body a link. */
  cardHref?: (item: T) => string | null
  /** Extra quick actions for the card's menu (the menu always offers Move to). */
  cardActions?: (item: T, column: C) => BoardQuickAction[]
}

export interface BoardProps<C extends string, T extends BoardItem> extends BoardConfig<C, T> {
  /** Server truth, grouped by column. */
  items: Record<C, T[]>
  /** Persist a move (a server action). Rejections roll the card back. */
  onMove: (item: T, from: C, to: C) => Promise<MoveResult>
  /** Client-side veto with a friendly reason (no request is made). */
  canMove?: (item: T, from: C, to: C) => string | null
  /** Optimistic transform of the item for its new column. */
  applyMove?: (item: T, to: C) => T
  /** Column totals when the server capped the rows it sent. */
  totals?: Partial<Record<C, number>>
  /** Footer under a capped column (e.g. a "see all" link). */
  columnFooter?: (column: C, shown: number, total: number) => React.ReactNode
  /** Toast after a successful move. Default: "Moved to <column>". */
  successMessage?: (item: T, to: BoardColumnDef<C>) => string
  className?: string
}
