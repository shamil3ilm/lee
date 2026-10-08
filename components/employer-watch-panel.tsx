'use client'
import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { focusRing } from '@/components/ui/focus-ring'
import { EmployerWatchRow } from '@/components/settings/employer-watch-row'
import type { EmployerWatchRow as Row } from '@/lib/defaults/watch-status'
import {
  COUNTRY_NAMES,
  filterWatchRows,
  WATCH_FILTER_LABELS,
  WATCH_FILTERS,
  type WatchFilter,
} from '@/lib/defaults/watch-filter'
import { cn } from '@/lib/utils'

interface EmployerWatchPanelProps {
  rows: Row[]
  /** Countries open by default (the user's regions); the rest start folded. */
  openCountries?: readonly string[]
}

/**
 * Settings › Sources › Employer watch: government, semi-government and
 * major Gulf employers with how lee checks each and where that stands.
 * Searchable and filterable; grouped by country, each group foldable.
 */
export function EmployerWatchPanel({ rows, openCountries = [] }: EmployerWatchPanelProps) {
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<WatchFilter>('all')
  const [country, setCountry] = useState('')
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const countries = useMemo(() => [...new Set(rows.map((r) => r.country))], [rows])
  const shown = filterWatchRows(rows, { text, filter, country })
  const narrowed = text.trim() !== '' || filter !== 'all' || country !== ''

  if (rows.length === 0) return null
  const isOpen = (c: string): boolean => toggled[c] ?? (narrowed || openCountries.includes(c))

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Where a careers site has a public feed, lee reads it daily; otherwise set up the employer&apos;s job alerts, let AI
        search look, or open the site weekly and mark it checked. Nationals-only openings are skipped.
      </p>
      <div role="group" aria-label="Filter employers" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search employers or countries"
            aria-label="Search employers"
            className="h-8 pl-8"
          />
        </div>
        <NativeSelect
          aria-label="Show"
          value={filter}
          onChange={(e) => setFilter(e.target.value as WatchFilter)}
          className="h-8 w-36"
        >
          {WATCH_FILTERS.map((f) => (
            <option key={f} value={f}>
              {WATCH_FILTER_LABELS[f]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} className="h-8 w-44">
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {COUNTRY_NAMES[c] ?? c}
            </option>
          ))}
        </NativeSelect>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {shown.length} {shown.length === 1 ? 'employer' : 'employers'} shown
      </p>
      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">No employers match.</p>
      ) : (
        countries.map((c) => {
          const group = shown.filter((r) => r.country === c)
          if (group.length === 0) return null
          const open = isOpen(c)
          const listId = `employer-watch-${c}`
          return (
            <div key={c}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setToggled((t) => ({ ...t, [c]: !open }))}
                className={cn(
                  'mb-1.5 flex w-full items-center gap-1.5 rounded-md text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground',
                  focusRing,
                )}
              >
                <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} aria-hidden="true" />
                {COUNTRY_NAMES[c] ?? c}
                <span className="font-normal normal-case tracking-normal">
                  · {group.filter((r) => r.watching).length} of {group.length} watched
                </span>
              </button>
              <ul id={listId} hidden={!open} className="divide-y rounded-md border text-sm">
                {group.map((r) => (
                  <EmployerWatchRow key={r.key} row={r} />
                ))}
              </ul>
            </div>
          )
        })
      )}
    </div>
  )
}
