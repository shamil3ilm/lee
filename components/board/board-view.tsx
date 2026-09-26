'use client'
import * as React from 'react'
import Link from 'next/link'
import { ArrowRightLeft, ChevronsLeftRight, ChevronsRightLeft, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { focusRing } from '@/components/ui/focus-ring'
import { wipState } from '@/lib/board/move'
import { TONE_BG, TONE_TEXT } from '@/lib/ui/tones'
import { cn } from '@/lib/utils'
import type { BoardColumnDef, BoardQuickAction } from '@/components/board/types'
import { useCollapsed } from '@/components/board/use-collapsed'

/**
 * Presentational pieces shared by the static board (server render, first
 * paint, fallback) and the lazily loaded drag-and-drop layer, so the swap
 * between them is visually identical. Free of @dnd-kit.
 */

export function BoardGrid({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={label}
      data-board={id}
      // Mobile: horizontal snap scroll, one column ≈ 85% of the screen.
      // lg+: columns share the width and scroll only when they can't fit.
      className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 lg:snap-none"
    >
      {children}
    </section>
  )
}

interface BoardColumnFrameProps<C extends string> {
  boardId: string
  def: BoardColumnDef<C>
  count: number
  total?: number
  isOver?: boolean
  columnRef?: (element: HTMLElement | null) => void
  footer?: React.ReactNode
  children: React.ReactNode
}

export function BoardColumnFrame<C extends string>({
  boardId,
  def,
  count,
  total,
  isOver,
  columnRef,
  footer,
  children,
}: BoardColumnFrameProps<C>) {
  const [collapsed, setCollapsed] = useCollapsed(boardId, def.id, def.defaultCollapsed)
  const shownTotal = total ?? count
  const wip = wipState(shownTotal, def.wipLimit)
  const headingId = `board-${boardId}-${def.id}-title`

  if (collapsed) {
    return (
      <div
        ref={columnRef}
        role="group"
        aria-labelledby={headingId}
        data-board-column={def.id}
        data-collapsed=""
        className={cn(
          'flex w-11 shrink-0 snap-start flex-col items-center gap-2 rounded-lg border bg-muted/40 py-2 transition-colors',
          isOver && 'border-ring bg-accent',
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`Expand ${def.title} column`}
          aria-expanded={false}
          onClick={() => setCollapsed(false)}
        >
          <ChevronsLeftRight />
        </Button>
        <span className="rounded-md bg-card px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {shownTotal}
        </span>
        <h3
          id={headingId}
          className={cn(
            'text-xs font-semibold uppercase tracking-wide [writing-mode:vertical-rl]',
            TONE_TEXT[def.tone],
          )}
        >
          {def.title}
        </h3>
      </div>
    )
  }

  return (
    <div
      ref={columnRef}
      role="group"
      aria-labelledby={headingId}
      data-board-column={def.id}
      className={cn(
        'flex w-[85vw] shrink-0 snap-start flex-col rounded-lg border bg-muted/40 transition-colors',
        'sm:w-72 lg:w-auto lg:min-w-[10.5rem] lg:flex-1 lg:shrink',
        isOver && 'border-ring bg-accent/70',
      )}
    >
      <div className="flex items-center gap-2 rounded-t-lg border-b bg-muted/70 px-3 py-2">
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', TONE_BG[def.tone])} />
        <h3
          id={headingId}
          className={cn('min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide', TONE_TEXT[def.tone])}
          title={def.hint}
        >
          {def.title}
        </h3>
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
            wip === 'over' ? 'bg-warning-soft text-warning' : 'bg-card text-muted-foreground',
          )}
          title={def.wipLimit ? `Soft limit: ${def.wipLimit} at a time` : undefined}
        >
          {def.wipLimit ? `${shownTotal}/${def.wipLimit}` : shownTotal}
          <span className="sr-only"> items</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-1.5 size-6"
          aria-label={`Collapse ${def.title} column`}
          aria-expanded={true}
          onClick={() => setCollapsed(true)}
        >
          <ChevronsRightLeft className="size-3.5" />
        </Button>
      </div>
      {wip === 'over' ? (
        <p className="border-b bg-warning-soft px-3 py-1 text-[11px] text-warning">
          Over the soft limit of {def.wipLimit}. Finish or move something first.
        </p>
      ) : null}
      {children}
      {footer ? <div className="border-t px-3 py-2 text-xs text-muted-foreground">{footer}</div> : null}
    </div>
  )
}

export function BoardColumnBody({
  empty,
  emptyText = 'Nothing here yet',
  children,
}: {
  empty: boolean
  emptyText?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/80 px-2 py-4 text-center text-xs text-muted-foreground">
          <span>{emptyText}</span>
          <span className="text-[11px] opacity-80">Drop a card here</span>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

interface BoardCardFrameProps<C extends string> {
  label: string
  href?: string | null
  isOverlay?: boolean
  column: C
  columns: readonly BoardColumnDef<C>[]
  onMoveTo?: (to: C) => void
  actions?: BoardQuickAction[]
  children: React.ReactNode
}

/**
 * Card chrome: surface, hover, optional link body and the quick-actions
 * menu (Move to… plus the board's own actions). The menu is the keyboard-
 * and touch-friendly alternative to dragging.
 */
export function BoardCardFrame<C extends string>({
  label,
  href,
  isOverlay,
  column,
  columns,
  onMoveTo,
  actions = [],
  children,
}: BoardCardFrameProps<C>) {
  const body = (
    <div className="min-w-0 flex-1 p-3 pr-1">{children}</div>
  )
  return (
    <div
      className={cn(
        'group/card flex items-start rounded-lg border bg-card text-sm text-card-foreground shadow-sm transition-[border-color,box-shadow]',
        isOverlay
          ? 'cursor-grabbing shadow-lg ring-2 ring-ring/40'
          : 'hover:border-ring/50 hover:shadow-md',
      )}
    >
      {href && !isOverlay ? (
        <Link href={href} className={cn('min-w-0 flex-1 rounded-l-lg', focusRing)}>
          {body}
        </Link>
      ) : (
        body
      )}
      {isOverlay || (!onMoveTo && actions.length === 0) ? null : (
        <CardActionsMenu
          label={label}
          column={column}
          columns={columns}
          onMoveTo={onMoveTo}
          actions={actions}
        />
      )}
    </div>
  )
}

function CardActionsMenu<C extends string>({
  label,
  column,
  columns,
  onMoveTo,
  actions,
}: {
  label: string
  column: C
  columns: readonly BoardColumnDef<C>[]
  onMoveTo?: (to: C) => void
  actions: BoardQuickAction[]
}) {
  const targets = columns.filter((c) => c.id !== column)
  return (
    // Keep pointer/key events on the menu from starting a card drag.
    <span
      className="shrink-0 p-1"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground opacity-80 group-hover/card:opacity-100"
            aria-label={`Actions for ${label}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {actions.map((a) =>
            a.href ? (
              <DropdownMenuItem key={a.label} asChild>
                <a
                  href={a.href}
                  target={a.external ? '_blank' : undefined}
                  rel={a.external ? 'noopener noreferrer' : undefined}
                >
                  {a.icon ? <a.icon className="size-4" /> : null}
                  {a.label}
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={a.label}
                onSelect={() => a.onSelect?.()}
                className={a.destructive ? 'text-destructive focus:text-destructive' : undefined}
              >
                {a.icon ? <a.icon className="size-4" /> : null}
                {a.label}
              </DropdownMenuItem>
            ),
          )}
          {onMoveTo && targets.length > 0 ? (
            <>
              {actions.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ArrowRightLeft className="size-3.5" aria-hidden="true" />
                Move to
              </DropdownMenuLabel>
              {targets.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => onMoveTo(t.id)}>
                  <span aria-hidden="true" className={cn('size-2 rounded-full', TONE_BG[t.tone])} />
                  {t.title}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
