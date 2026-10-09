'use client'
import Link from 'next/link'
import { Loader2, SlidersHorizontal, Star, X } from 'lucide-react'
import { useUrlFilters } from '@/components/filters/use-url-filters'
import { ResponsivePopover } from '@/components/responsive-popover'
import { RegionFilter } from '@/components/regions/region-filter'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { focusRing } from '@/components/ui/focus-ring'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { INDUSTRY_LABELS, isIndustry } from '@/lib/company-discovery/industry'
import { MIN_GROWTH_STEPS } from '@/lib/company-discovery/growth/types'
import { STAGE_LABELS, STAGES } from '@/lib/company-discovery/types'
import { plural } from '@/lib/ui/labels'
import { cn } from '@/lib/utils'
import { sourceTagLabel } from './types'

/**
 * Discovery › Companies toolbar: region quick chips (starred regions
 * first), sort, and a "Filters" popover (a bottom sheet on phones) for the
 * rest; active filters show as removable chips with the result count. URL
 * state, applied on change, like the Jobs tab.
 */

export interface QuickRegion {
  id: string
  label: string
  starred: boolean
}

export interface CompanyToolbarProps {
  view: string
  region: readonly string[]
  quickRegions: readonly QuickRegion[]
  sort: string
  minGrowth: number
  gems: boolean
  stage: string
  industry: string
  source: string
  hiring: boolean
  warm: boolean
  industries: readonly string[]
  sources: readonly string[]
  total: number
  dismissedCount: number
}

const SORT_LABELS: Readonly<Record<string, string>> = {
  fit: 'Best fit',
  growth: 'Fastest growth',
  roles: 'Most open roles',
  newest: 'Newest',
}

const chip = 'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors'

export function CompanyToolbar(p: CompanyToolbarProps) {
  const { setParams, pending } = useUrlFilters()
  const set = (patch: Record<string, string | null>): void => setParams({ tab: 'companies', ...patch })
  const single = p.region.length === 1 ? p.region[0] : null

  const active: Array<{ key: string; label: string; clear: Record<string, null> }> = [
    ...(p.region.length > 0 && !p.quickRegions.some((r) => r.id === single) ? [{ key: 'region', label: `Region: ${p.region.length} selected`, clear: { region: null } }] : []),
    ...(p.minGrowth > 0 ? [{ key: 'minGrowth', label: `Growth ${p.minGrowth}+`, clear: { minGrowth: null } }] : []),
    ...(p.gems && p.view !== 'radar' ? [{ key: 'gems', label: 'Under the radar', clear: { gems: null } }] : []),
    ...(p.stage && p.stage in STAGE_LABELS ? [{ key: 'stage', label: STAGE_LABELS[p.stage as keyof typeof STAGE_LABELS], clear: { stage: null } }] : []),
    ...(p.industry && isIndustry(p.industry) ? [{ key: 'industry', label: INDUSTRY_LABELS[p.industry], clear: { industry: null } }] : []),
    ...(p.source ? [{ key: 'source', label: `Source: ${sourceTagLabel(p.source)}`, clear: { source: null } }] : []),
    ...(p.hiring ? [{ key: 'hiring', label: 'Has a job board or careers page', clear: { hiring: null } }] : []),
    ...(p.warm ? [{ key: 'warm', label: 'Warm intro', clear: { warm: null } }] : []),
  ]
  const filterCount = active.filter((a) => a.key !== 'region').length

  return (
    <div className="space-y-2" data-testid="company-filters" data-pending={pending || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Region" className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={cn(chip, focusRing, p.region.length === 0 ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
            aria-pressed={p.region.length === 0}
            onClick={() => set({ region: null })}
          >
            All regions
          </button>
          {p.quickRegions.map((r) => (
            <button
              key={r.id}
              type="button"
              className={cn(chip, focusRing, single === r.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
              aria-pressed={single === r.id}
              onClick={() => set({ region: single === r.id ? null : r.id })}
              data-testid={`company-region-${r.id}`}
            >
              {r.starred ? <Star className="size-3 fill-current" aria-label="Starred" /> : null}
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end">
          <NativeSelect
            aria-label="Sort companies"
            value={p.sort}
            onChange={(e) => set({ sort: e.target.value === 'fit' ? null : e.target.value })}
            className="h-9 flex-1 sm:h-8 sm:w-auto sm:flex-none"
            data-testid="company-sort"
          >
            {Object.entries(SORT_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
          <ResponsivePopover
            title="Filter companies"
            contentClassName="w-80 space-y-4"
            trigger={
              <Button type="button" size="sm" variant="outline" className="h-9 sm:h-8" data-testid="company-filters-button">
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                {filterCount > 0 ? `Filters (${filterCount})` : 'Filters'}
              </Button>
            }
          >
            <div className="space-y-4" data-testid="company-filters-panel">
              <div className="space-y-1.5">
                <Label className="text-xs">Regions</Label>
                <RegionFilter value={p.region} apply={(v) => set({ region: v || null })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="co-min-growth" className="text-xs">
                    Minimum growth
                  </Label>
                  <NativeSelect
                    id="co-min-growth"
                    value={String(p.minGrowth)}
                    onChange={(e) => set({ minGrowth: e.target.value === '0' ? null : e.target.value })}
                    className="h-8"
                    data-testid="company-min-growth"
                  >
                    <option value="0">Any growth</option>
                    {MIN_GROWTH_STEPS.map((n) => (
                      <option key={n} value={n}>
                        Growth {n}+
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-stage" className="text-xs">
                    Size or stage
                  </Label>
                  <NativeSelect id="co-stage" value={p.stage} onChange={(e) => set({ stage: e.target.value || null })} className="h-8">
                    <option value="">Any stage</option>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-industry" className="text-xs">
                    Industry
                  </Label>
                  <NativeSelect id="co-industry" value={p.industry} onChange={(e) => set({ industry: e.target.value || null })} className="h-8" data-testid="company-industry">
                    <option value="">All industries</option>
                    {p.industries.filter(isIndustry).map((i) => (
                      <option key={i} value={i}>
                        {INDUSTRY_LABELS[i]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-source" className="text-xs">
                    Source
                  </Label>
                  <NativeSelect id="co-source" value={p.source} onChange={(e) => set({ source: e.target.value || null })} className="h-8">
                    <option value="">All sources</option>
                    {p.sources.map((s) => (
                      <option key={s} value={s}>
                        {sourceTagLabel(s)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div className="space-y-2">
                <Checkbox id="co-gems" checked={p.gems} onChange={(e) => set({ gems: e.target.checked ? '1' : null })} label="Under the radar only" data-testid="company-gems" />
                <Checkbox id="co-hiring" checked={p.hiring} onChange={(e) => set({ hiring: e.target.checked ? '1' : null })} label="Has a job board or careers page" data-testid="company-hiring-filter" />
                <Checkbox id="co-warm" checked={p.warm} onChange={(e) => set({ warm: e.target.checked ? '1' : null })} label="Warm intro (your connections work there)" />
              </div>
              <Link
                href="/discoveries?tab=companies&view=dismissed"
                className={cn('inline-flex min-h-6 items-center text-xs underline underline-offset-4', focusRing)}
                data-testid="company-show-dismissed"
              >
                Show companies you marked not interested ({p.dismissedCount})
              </Link>
            </div>
          </ResponsivePopover>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {active.map((a) => (
          <button
            key={a.key}
            type="button"
            className={cn(chip, focusRing, 'h-7 bg-muted hover:bg-muted/70')}
            onClick={() => set(a.clear)}
            aria-label={`Remove filter: ${a.label}`}
            data-testid="company-active-filter"
          >
            {a.label}
            <X className="size-3" aria-hidden="true" />
          </button>
        ))}
        {active.length > 1 ? (
          <button
            type="button"
            className={cn('h-7 px-2 text-xs underline underline-offset-4', focusRing)}
            onClick={() => set({ region: null, minGrowth: null, gems: null, stage: null, industry: null, source: null, hiring: null, warm: null })}
          >
            Clear all
          </button>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground" role="status" aria-live="polite" data-testid="company-count">
          {pending ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
          {plural(p.total, 'company', 'companies')}
        </span>
      </div>
    </div>
  )
}
