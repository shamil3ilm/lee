'use client'
import { useTransition } from 'react'
import { Loader2, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { MoreFilters } from '@/components/discovery/more-filters'
import {
  activeMoreFilters,
  REGION_LABELS,
  SORT_LABELS,
  STATUS_LABELS,
  type DiscoveryRegionFilter,
  type DiscoverySort,
  type DiscoveryStatusFilter,
} from '@/lib/discovery/filter-options'

export type { DiscoveryRegionFilter, DiscoverySort, DiscoveryStatusFilter } from '@/lib/discovery/filter-options'

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

const JOB_ONLY: ReadonlySet<DiscoveryStatusFilter> = new Set(['quarantined', 'shortlisted', 'filtered'])

/**
 * Discovery's filter toolbar: the primary filters inline (Status, Region,
 * Sort), the rest under "More filters", everything applied on change. URL
 * state, so filters survive refresh, are shareable and the server does the
 * work. (A local implementation of the auto-apply filter pattern; the
 * shared toolbar primitive replaces it later.)
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
  const jobs = tab === 'jobs'

  const update = (patch: Record<string, string>): void => {
    const next = new URLSearchParams(params.toString())
    next.set('tab', tab)
    // Any filter change starts over at the first page.
    next.delete('page')
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || (v === 'new' && k === 'status' && !next.has('status'))) next.delete(k)
      else next.set(k, v)
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

  const more = { minScore, sourceId, scoredOnly, showFiltered: showFiltered && status === 'new' }
  const moreCount = activeMoreFilters(more)
  const anyActive = moreCount > 0 || (jobs && region !== 'all') || (!hideStatus && status !== 'new')

  return (
    <div
      role="group"
      aria-label="Filter discoveries"
      className="flex flex-wrap items-center gap-2"
      data-pending={isPending || undefined}
      data-testid="discovery-filters"
    >
      {hideStatus ? null : (
        <NativeSelect aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value })} className="h-8 w-[11rem]">
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </NativeSelect>
      )}
      {jobs ? (
        <>
          <NativeSelect
            aria-label="Region"
            value={region}
            onChange={(e) => update({ region: e.target.value === 'all' ? '' : e.target.value })}
            className="h-8 w-[8.5rem]"
          >
            {(Object.keys(REGION_LABELS) as DiscoveryRegionFilter[]).map((r) => (
              <option key={r} value={r}>
                {REGION_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Sort" value={sort} onChange={(e) => update({ sort: e.target.value })} className="h-8 w-[13.5rem] max-sm:w-[11rem]">
            {(Object.keys(SORT_LABELS) as DiscoverySort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </>
      ) : null}
      <MoreFilters
        jobs={jobs}
        values={more}
        canHideFiltered={jobs && status === 'new' && !hideStatus}
        sources={sources}
        count={moreCount}
        onChange={update}
      />
      {anyActive ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => update({ status: '', region: '', source: '', minScore: '', scored: '', filtered: '' })}
        >
          <X className="size-3.5" aria-hidden="true" />
          Clear
        </Button>
      ) : null}
      {isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" /> : null}
    </div>
  )
}
