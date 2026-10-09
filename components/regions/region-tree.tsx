'use client'
import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { checkState, type RegionSelection } from '@/lib/regions/selection'
import { childrenOf, nodeName } from '@/lib/regions/tree'
import { cn } from '@/lib/utils'

interface RegionTreeProps {
  roots: readonly string[]
  selection: RegionSelection
  onToggle: (id: string) => void
  /** Nodes open at first render (top levels). */
  defaultOpen?: readonly string[]
  /** Postings per node, shown beside the name when given. */
  counts?: ReadonlyMap<string, number>
  idPrefix: string
}

/**
 * The picker's tree: a checkbox per node (checked when it or an ancestor is
 * selected, mixed when some descendant is) and a disclosure button for its
 * children. Plain nested lists of native checkboxes, so keyboard and screen
 * readers work as for any checkbox list.
 */
export function RegionTree({ roots, selection, onToggle, defaultOpen = [], counts, idPrefix }: RegionTreeProps) {
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set(defaultOpen))
  const toggleOpen = (id: string): void =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <ul className="space-y-0.5" data-testid="region-tree">
      {roots.map((id) => (
        <TreeItem
          key={id}
          id={id}
          depth={0}
          selection={selection}
          onToggle={onToggle}
          open={open}
          onOpen={toggleOpen}
          counts={counts}
          idPrefix={idPrefix}
        />
      ))}
    </ul>
  )
}

interface TreeItemProps {
  id: string
  depth: number
  selection: RegionSelection
  onToggle: (id: string) => void
  open: ReadonlySet<string>
  onOpen: (id: string) => void
  counts?: ReadonlyMap<string, number>
  idPrefix: string
}

function TreeItem({ id, depth, selection, onToggle, open, onOpen, counts, idPrefix }: TreeItemProps) {
  const children = childrenOf(id)
  const state = checkState(id, selection)
  const expanded = open.has(id)
  const name = nodeName(id)
  const count = counts?.get(id)
  const groupId = `${idPrefix}-${id}-children`
  return (
    <li>
      <div className="flex min-h-8 items-center gap-1" style={{ paddingLeft: `${depth * 1}rem` }}>
        {children.length > 0 ? (
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={expanded}
            aria-controls={groupId}
            aria-label={`${expanded ? 'Hide' : 'Show'} places in ${name}`}
            onClick={() => onOpen(id)}
          >
            <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} aria-hidden="true" />
          </button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden="true" />
        )}
        <Checkbox
          id={`${idPrefix}-${id}`}
          checked={state === 'checked'}
          indeterminate={state === 'indeterminate'}
          onChange={() => onToggle(id)}
          data-region={id}
          label={
            <span className="flex items-center gap-2">
              <span>{name}</span>
              {count !== undefined ? <span className="text-xs tabular-nums text-muted-foreground">{count}</span> : null}
            </span>
          }
          className="py-1"
        />
      </div>
      {children.length > 0 && expanded ? (
        <ul id={groupId} className="space-y-0.5">
          {children.map((c) => (
            <TreeItem
              key={c}
              id={c}
              depth={depth + 1}
              selection={selection}
              onToggle={onToggle}
              open={open}
              onOpen={onOpen}
              counts={counts}
              idPrefix={idPrefix}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
