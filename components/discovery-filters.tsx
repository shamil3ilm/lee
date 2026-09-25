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
export type DiscoveryStatusFilter = 'new' | 'saved' | 'dismissed'

interface DiscoveryFiltersProps {
  tab: 'jobs' | 'companies'
  status: DiscoveryStatusFilter
  minScore: number
  sort: DiscoverySort
}

const STATUS_LABELS: Record<DiscoveryStatusFilter, string> = {
  new: 'New',
  saved: 'Saved',
  dismissed: 'Dismissed',
}

const SORT_LABELS: Record<DiscoverySort, string> = {
  combined: 'Combined (match + benefits)',
  match: 'Match score',
  benefits: 'Benefits score',
  posted: 'Recently posted',
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
}: DiscoveryFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const update = (patch: Record<string, string>): void => {
    const next = new URLSearchParams(params.toString())
    next.set('tab', tab)
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === 'new' && k === 'status' && !next.has('status')) {
        next.delete(k)
      } else {
        next.set(k, v)
      }
    }
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`)
    })
  }

  return (
    <div
      className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border bg-card/40 p-3"
      data-pending={isPending || undefined}
    >
      <div className="w-full space-y-1.5 sm:w-auto">
        <Label htmlFor="disc-status" className="text-xs">Status</Label>
        <Select
          value={status}
          onValueChange={(v) => update({ status: v })}
        >
          <SelectTrigger id="disc-status" className="h-8 w-full sm:w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as DiscoveryStatusFilter[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tab === 'jobs' ? (
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
    </div>
  )
}
