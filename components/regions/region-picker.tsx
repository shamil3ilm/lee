'use client'
import * as React from 'react'
import { MapPin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ResponsivePopover } from '@/components/responsive-popover'
import { chainLabel } from '@/lib/regions/display'
import { searchRegions, selectionSummary } from '@/lib/regions/picker'
import { isCovered, pickRegion, toggleRegion, type RegionSelection } from '@/lib/regions/selection'
import { nodeName, shortName } from '@/lib/regions/tree'
import { cn } from '@/lib/utils'
import { RegionTree } from './region-tree'

export interface RegionPickerProps {
  value: RegionSelection
  onChange: (next: string[]) => void
  /** Top-level nodes of the tree. */
  roots: readonly string[]
  /** Further top-level nodes under "Other countries" (collapsed). */
  otherRoots?: readonly string[]
  quickPicks?: readonly string[]
  /** Accessible name of the trigger and the popover ("Region", "Target regions"). */
  label: string
  /** Trigger text with nothing selected ("All regions"). */
  emptyLabel: string
  /** Show the selection as removable chips beside the trigger. */
  chips?: boolean
  counts?: ReadonlyMap<string, number>
  className?: string
  triggerClassName?: string
  testId?: string
}

/**
 * Hierarchical region picker: search (names, old spellings, IT parks and
 * free zones), quick picks, a tree with mixed parent states and removable
 * chips. A popover from `sm` up, a bottom sheet on phones. Controlled: the
 * caller stores the selection (URL state or a form field).
 */
export function RegionPicker({
  value,
  onChange,
  roots,
  otherRoots = [],
  quickPicks = [],
  label,
  emptyLabel,
  chips = true,
  counts,
  className,
  triggerClassName,
  testId = 'region-picker',
}: RegionPickerProps) {
  const idPrefix = React.useId().replace(/:/g, '')
  const [query, setQuery] = React.useState('')
  const toggle = (id: string): void => onChange(toggleRegion(value, id))
  const all = [...roots, ...otherRoots]
  const hits = query.trim() ? searchRegions(query, all) : []

  const trigger = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn('h-8 max-w-full justify-start', triggerClassName)}
      aria-label={`${label}: ${selectionSummary(value, emptyLabel, 3)}`}
      data-testid={testId}
    >
      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{selectionSummary(value, emptyLabel)}</span>
    </Button>
  )

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <ResponsivePopover trigger={trigger} title={label} contentClassName="w-[min(22rem,calc(100vw-2rem))] space-y-3">
        {/* On phones the sheet's close button sits top-right: keep the field clear of it. */}
        <div className="max-sm:pr-8">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: Kochi, Cochin, DIFC, Technopark…"
            aria-label={`Search ${label.toLowerCase()}`}
            className="h-8"
          />
        </div>
        {quickPicks.length > 0 && !query ? (
          <div role="group" aria-label="Quick picks" className="flex flex-wrap gap-1.5">
            {quickPicks.map((id) => {
              const on = value.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(pickRegion(value, id))}
                  className={cn(
                    'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-accent',
                  )}
                  data-quick-pick={id}
                >
                  {shortName(id)}
                </button>
              )
            })}
          </div>
        ) : null}
        {query ? (
          <SearchResults hits={hits} value={value} onToggle={toggle} idPrefix={`${idPrefix}-s`} />
        ) : (
          <div className="space-y-2">
            <RegionTree roots={roots} selection={value} onToggle={toggle} defaultOpen={roots.slice(0, 2)} counts={counts} idPrefix={`${idPrefix}-t`} />
            {otherRoots.length > 0 ? (
              <details className="group">
                <summary className="cursor-pointer select-none rounded-sm px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  Other countries
                </summary>
                <div className="pt-1">
                  <RegionTree roots={otherRoots} selection={value} onToggle={toggle} counts={counts} idPrefix={`${idPrefix}-o`} />
                </div>
              </details>
            ) : null}
          </div>
        )}
        <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
          <span>{value.length === 0 ? 'Nothing selected' : `${value.length} selected`}</span>
          {value.length > 0 ? (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange([])}>
              Clear
            </Button>
          ) : null}
        </div>
      </ResponsivePopover>
      {chips ? <SelectionChips value={value} onRemove={toggle} /> : null}
    </div>
  )
}

function SearchResults({
  hits,
  value,
  onToggle,
  idPrefix,
}: {
  hits: ReturnType<typeof searchRegions>
  value: RegionSelection
  onToggle: (id: string) => void
  idPrefix: string
}) {
  if (hits.length === 0) return <p className="px-1 text-sm text-muted-foreground">No place matches.</p>
  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Matching places">
      {hits.map((h) => (
        <li key={h.id}>
          <Checkbox
            id={`${idPrefix}-${h.id}`}
            checked={isCovered(h.id, value)}
            onChange={() => onToggle(h.id)}
            data-region={h.id}
            label={h.matched ? `${nodeName(h.id)} (${h.matched})` : nodeName(h.id)}
            description={chainLabel(h.id)}
          />
        </li>
      ))}
    </ul>
  )
}

/** The selection as chips, each removable. */
export function SelectionChips({ value, onRemove }: { value: RegionSelection; onRemove: (id: string) => void }) {
  if (value.length === 0) return null
  return (
    <ul className="flex flex-wrap items-center gap-1" aria-label="Selected regions">
      {value.map((id) => (
        <li key={id}>
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary pl-2.5 pr-0.5 text-xs font-medium text-secondary-foreground" title={chainLabel(id)}>
            {shortName(id)}
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={`Remove ${nodeName(id)}`}
              className="grid size-6 place-items-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
