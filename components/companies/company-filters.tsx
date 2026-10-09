'use client'
import { Loader2 } from 'lucide-react'
import { useUrlFilters } from '@/components/filters/use-url-filters'
import { RegionFilter } from '@/components/regions/region-filter'
import { NativeSelect } from '@/components/ui/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { INDUSTRY_LABELS, isIndustry } from '@/lib/company-discovery/industry'
import { STAGE_LABELS, STAGES } from '@/lib/company-discovery/types'
import { plural } from '@/lib/ui/labels'
import { sourceTagLabel } from './types'

interface CompanyFiltersProps {
  status: string
  region: readonly string[]
  industry: string
  stage: string
  hiring: boolean
  warm: boolean
  source: string
  industries: readonly string[]
  sources: readonly string[]
  total: number
}

/** Discovery › Companies filters: URL state, applied on change. */
export function CompanyFilters(p: CompanyFiltersProps) {
  const { setParams, pending } = useUrlFilters()
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="company-filters">
      <NativeSelect aria-label="Status" value={p.status} onChange={(e) => setParams({ status: e.target.value === 'new' ? null : e.target.value })} className="h-8 w-auto">
        <option value="new">New</option>
        <option value="saved">Saved</option>
        <option value="dismissed">Dismissed</option>
      </NativeSelect>
      <RegionFilter value={p.region} />
      <NativeSelect aria-label="Industry" value={p.industry} onChange={(e) => setParams({ industry: e.target.value || null })} className="h-8 w-auto" data-testid="company-industry">
        <option value="">All industries</option>
        {p.industries.filter(isIndustry).map((i) => (
          <option key={i} value={i}>
            {INDUSTRY_LABELS[i]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Size or stage" value={p.stage} onChange={(e) => setParams({ stage: e.target.value || null })} className="h-8 w-auto">
        <option value="">Any stage</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Source" value={p.source} onChange={(e) => setParams({ source: e.target.value || null })} className="h-8 w-auto">
        <option value="">All sources</option>
        {p.sources.map((s) => (
          <option key={s} value={s}>
            {sourceTagLabel(s)}
          </option>
        ))}
      </NativeSelect>
      <Checkbox
        id="company-hiring"
        checked={p.hiring}
        onChange={(e) => setParams({ hiring: e.target.checked ? '1' : null })}
        label="Has a job board or careers page"
        data-testid="company-hiring"
      />
      <Checkbox id="company-warm" checked={p.warm} onChange={(e) => setParams({ warm: e.target.checked ? '1' : null })} label="Warm intro" />
      <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground" role="status" aria-live="polite">
        {pending ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
        {plural(p.total, 'company', 'companies')}
      </span>
    </div>
  )
}
