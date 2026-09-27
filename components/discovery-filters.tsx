'use client'
import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type DiscoverySort = 'combined' | 'match' | 'benefits' | 'posted'
export type DiscoveryStatusFilter =
  | 'new'
  | 'shortlisted'
  | 'saved'
  | 'dismissed'
  | 'filtered'
  | 'quarantined'
export type DiscoveryRegionFilter = 'all' | 'ae' | 'gcc' | 'in' | 'remote'

interface DiscoveryFiltersProps {
  tab: 'jobs' | 'companies'
  status: DiscoveryStatusFilter
  minScore: number
  sort: DiscoverySort
  /** v17 §1 — Scam Shield quarantine count (jobs tab only). */
  quarantinedCount?: number
  /** Relevance gate — how many postings are filtered out. */
  filteredCount?: number
  region?: DiscoveryRegionFilter
  sourceId?: string
  sources?: ReadonlyArray<{ id: string; name: string }>
  scoredOnly?: boolean
  /** New tab only: include filtered-out postings (dimmed) in the list. */
  showFiltered?: boolean
  /** Board view: columns are the statuses, so no status picker. */
  hideStatus?: boolean
}

const STATUS_LABELS: Record<DiscoveryStatusFilter, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  saved: 'Saved',
  dismissed: 'Dismissed',
  filtered: 'Filtered out',
  quarantined: 'Quarantined',
}

const JOB_ONLY: ReadonlySet<DiscoveryStatusFilter> = new Set(['quarantined', 'shortlisted', 'filtered'])

const SORT_LABELS: Record<DiscoverySort, string> = {
  combined: 'Combined (match + benefits)',
  match: 'Match score',
  benefits: 'Benefits score',
  posted: 'Recently posted',
}

const REGION_LABELS: Record<DiscoveryRegionFilter, string> = {
  all: 'All regions',
  ae: 'UAE',
  gcc: 'GCC',
  in: 'India',
  remote: 'Remote',
}

/**
 * URL-driven filters for the discovery inbox. Updating any field pushes the
 * new query string; the server component re-renders with the fresh list.
 * Using URL state (not React state) means filters survive refresh, are
 * shareable, and let the RSC do all the DB work.
 */
export function DiscoveryFilters({
  tab,
  status,
  minScore,
  sort,
  quarantinedCount = 0,
  filteredCount = 0,
  region = 'all',
  sourceId = '',
  sources = [],
  scoredOnly = false,
  showFiltered = false,
  hideStatus = false,
}: DiscoveryFiltersProps) {
  const statuses = (Object.keys(STATUS_LABELS) as DiscoveryStatusFilter[]).filter(
    (s) => !JOB_ONLY.has(s) || tab === 'jobs',
  )
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const update = (patch: Record<string, string>): void => {
    const next = new URLSearchParams(params.toString())
    next.set('tab', tab)
    // Any filter change starts over at the first page.
    next.delete('page')
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || (v === 'new' && k === 'status' && !next.has('status'))) {
        next.delete(k)
      } else {
        next.set(k, v)
      }
    }
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`)
    })
  }

  const statusLabel = (s: DiscoveryStatusFilter): string => {
    if (s === 'quarantined') return `${STATUS_LABELS[s]} (${quarantinedCount})`
    if (s === 'filtered') return `${STATUS_LABELS[s]} (${filteredCount})`
    return STATUS_LABELS[s]
  }

  return (
    <div
      className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border bg-card/40 p-3"
      data-pending={isPending || undefined}
    >
      <div className={hideStatus ? 'hidden' : 'w-full space-y-1.5 sm:w-auto'}>
        <Label htmlFor="disc-status" className="text-xs">Status</Label>
        <Select value={status} onValueChange={(v) => update({ status: v })}>
          <SelectTrigger id="disc-status" className="h-8 w-full sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tab === 'jobs' ? (
        <>
          <div className="w-[calc(50%-0.375rem)] space-y-1.5 sm:w-auto">
            <Label htmlFor="disc-region" className="text-xs">Region</Label>
            <Select value={region} onValueChange={(v) => update({ region: v === 'all' ? '' : v })}>
              <SelectTrigger id="disc-region" className="h-8 w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REGION_LABELS) as DiscoveryRegionFilter[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {REGION_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[calc(50%-0.375rem)] space-y-1.5 sm:w-auto">
            <Label htmlFor="disc-source" className="text-xs">Source</Label>
            <Select value={sourceId || 'all'} onValueChange={(v) => update({ source: v === 'all' ? '' : v })}>
              <SelectTrigger id="disc-source" className="h-8 w-full sm:w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-auto">
            <Label htmlFor="disc-sort" className="text-xs">Sort</Label>
            <Select value={sort} onValueChange={(v) => update({ sort: v })}>
              <SelectTrigger id="disc-sort" className="h-8 w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as DiscoverySort[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SORT_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}

      <div className="w-full flex-1 space-y-1.5 sm:min-w-[180px]">
        <Label htmlFor="disc-min" className="flex items-center justify-between text-xs">
          <span>Min match score</span>
          <span className="tabular-nums text-muted-foreground">{minScore}</span>
        </Label>
        <input
          id="disc-min"
          type="range"
          min={0}
          max={100}
          step={5}
          value={minScore}
          onChange={(e) => update({ minScore: e.target.value })}
          className="w-full accent-primary"
        />
      </div>

      {tab === 'jobs' ? (
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:w-auto sm:pb-1">
          <Toggle
            id="disc-scored"
            label="Scored only"
            checked={scoredOnly}
            onChange={(on) => update({ scored: on ? '1' : '' })}
          />
          {status === 'new' && !hideStatus ? (
            <Toggle
              id="disc-hide-filtered"
              label="Hide filtered"
              checked={!showFiltered}
              onChange={(on) => update({ filtered: on ? '' : 'show' })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-input accent-primary"
      />
      {label}
    </label>
  )
}
