'use client'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { MoreFilterValues } from '@/lib/discovery/filter-options'

interface MoreFiltersProps {
  jobs: boolean
  values: MoreFilterValues
  /** "Show filtered-out postings" only makes sense on the New list. */
  canHideFiltered: boolean
  sources: ReadonlyArray<{ id: string; name: string }>
  /** Active filters in here, shown on the button. */
  count: number
  onChange: (patch: Record<string, string>) => void
}

/** The secondary Discovery filters, applied on change like the inline ones. */
export function MoreFilters({ jobs, values, canHideFiltered, sources, count, onChange }: MoreFiltersProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8" data-testid="more-filters">
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          {count > 0 ? `More filters (${count})` : 'More filters'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-4" aria-label="More filters">
        {jobs ? (
          <div className="space-y-1.5">
            <Label htmlFor="disc-source" className="text-xs">
              Source
            </Label>
            <NativeSelect
              id="disc-source"
              value={values.sourceId || 'all'}
              onChange={(e) => onChange({ source: e.target.value === 'all' ? '' : e.target.value })}
              className="h-8"
            >
              <option value="all">All sources</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="disc-min" className="flex items-center justify-between text-xs">
            <span>Minimum Fit</span>
            <span className="tabular-nums text-muted-foreground">{values.minScore}</span>
          </Label>
          <input
            id="disc-min"
            type="range"
            min={0}
            max={100}
            step={5}
            value={values.minScore}
            onChange={(e) => onChange({ minScore: e.target.value === '0' ? '' : e.target.value })}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>
        {jobs ? (
          <div className="space-y-2">
            <Check
              id="disc-scored"
              label="AI-scored only"
              checked={values.scoredOnly}
              onChange={(on) => onChange({ scored: on ? '1' : '' })}
            />
            {canHideFiltered ? (
              <Check
                id="disc-show-filtered"
                label="Include filtered-out postings"
                checked={values.showFiltered}
                onChange={(on) => onChange({ filtered: on ? 'show' : '' })}
              />
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return <Checkbox id={id} label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
}
