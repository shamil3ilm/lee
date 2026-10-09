'use client'
import { Layers, Loader2, Megaphone, X } from 'lucide-react'
import { useUrlFilters } from '@/components/filters/use-url-filters'
import { plural } from '@/lib/ui/labels'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { MoreFilters } from '@/components/discovery/more-filters'
import { RegionFilter } from '@/components/regions/region-filter'
import {
  activeMoreFilters,
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
  /** Results for the current filters, announced after each change. */
  resultCount?: number
  /** List view only: the "Group by region" toggle and its state. */
  byRegion?: boolean
  canGroupByRegion?: boolean
  /** Jobs tab: only LinkedIn hiring posts. */
  hiringPosts?: boolean
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
  region = [],
  sourceId = '',
  sources = [],
  scoredOnly = false,
  showFiltered = false,
  hideStatus = false,
  resultCount,
  byRegion = false,
  canGroupByRegion = false,
  hiringPosts = false,
}: DiscoveryFiltersProps) {
  const statuses = (Object.keys(STATUS_LABELS) as DiscoveryStatusFilter[]).filter(
    (s) => !JOB_ONLY.has(s) || tab === 'jobs',
  )
  const { setParams, pending: isPending } = useUrlFilters()
  const jobs = tab === 'jobs'

  // The shared auto-apply filters (replace, page reset); Discovery keeps its
  // own rules: the tab is always explicit and "New" is the default status.
  const update = (patch: Record<string, string>): void => {
    const next: Record<string, string | null> = { tab }
    for (const [k, v] of Object.entries(patch)) next[k] = v === '' || (k === 'status' && v === 'new') ? null : v
    setParams(next)
  }

  const statusLabel = (s: DiscoveryStatusFilter): string => {
    if (s === 'quarantined') return `${STATUS_LABELS[s]} (${quarantinedCount})`
    if (s === 'filtered') return `${STATUS_LABELS[s]} (${filteredCount})`
    return STATUS_LABELS[s]
  }

  const more = { minScore, sourceId, scoredOnly, showFiltered: showFiltered && status === 'new' }
  const moreCount = activeMoreFilters(more)
  const anyActive = moreCount > 0 || (jobs && (region.length > 0 || hiringPosts)) || (!hideStatus && status !== 'new')

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
          <RegionFilter value={region} apply={(v) => update({ region: v })} />
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
      {jobs ? (
        <Button
          type="button"
          size="sm"
          variant={hiringPosts ? 'secondary' : 'ghost'}
          className="h-8 px-2 text-xs"
          aria-pressed={hiringPosts}
          onClick={() => update({ posts: hiringPosts ? '' : '1' })}
          data-testid="hiring-posts-filter"
        >
          <Megaphone className="size-3.5" aria-hidden="true" />
          Hiring posts
        </Button>
      ) : null}
      {jobs && canGroupByRegion ? (
        <Button
          type="button"
          size="sm"
          variant={byRegion ? 'secondary' : 'ghost'}
          className="h-8 px-2 text-xs"
          aria-pressed={byRegion}
          onClick={() => update({ by: byRegion ? '' : 'region' })}
          data-testid="group-by-region"
        >
          <Layers className="size-3.5" aria-hidden="true" />
          Group by region
        </Button>
      ) : null}
      {anyActive ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => update({ status: '', region: '', source: '', minScore: '', scored: '', filtered: '', posts: '' })}
        >
          <X className="size-3.5" aria-hidden="true" />
          Clear
        </Button>
      ) : null}
      {isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
      {resultCount !== undefined ? (
        <p role="status" aria-live="polite" className="sr-only">
          {isPending ? '' : plural(resultCount, tab === 'jobs' ? 'job' : 'company', tab === 'jobs' ? 'jobs' : 'companies')}
        </p>
      ) : null}
    </div>
  )
}
