'use client'
import * as React from 'react'
import { useUrlFilters } from '@/components/filters/use-url-filters'
import { parseRegionParam, serializeRegionParam } from '@/lib/regions/selection'
import { FILTER_OTHER_ROOTS, FILTER_ROOTS, QUICK_PICKS } from '@/lib/regions/taxonomy'
import { RegionPicker } from './region-picker'

interface RegionFilterProps {
  /** Current selection, parsed on the server from `?region=`. */
  value: readonly string[]
  /**
   * Apply a new `region` value ("" clears it). Defaults to merging it into
   * the URL; a toolbar passes its own so its pending state covers it.
   */
  apply?: (region: string) => void
  className?: string
}

/**
 * The Region filter for Discovery and the Shortlist: a hierarchical picker
 * bound to `?region=kerala,dubai` (URL state, applied on change; a change
 * resets the page). Old links (`?region=gcc`, `?region=ae`) still work.
 */
export function RegionFilter({ value, apply, className }: RegionFilterProps) {
  const { setParams } = useUrlFilters()
  // Optimistic: the picker shows the change at once while the page reloads.
  const [local, setLocal] = React.useState<readonly string[]>(value)
  const key = value.join(',')
  const [shownKey, setShownKey] = React.useState(key)
  if (key !== shownKey) {
    // The URL moved (Back, Clear): follow it.
    setShownKey(key)
    setLocal(parseRegionParam(key))
  }
  const onChange = (next: string[]): void => {
    setLocal(next)
    const serialized = serializeRegionParam(next)
    if (apply) apply(serialized)
    else setParams({ region: serialized || null })
  }
  return (
    <RegionPicker
      value={local}
      onChange={onChange}
      roots={FILTER_ROOTS}
      otherRoots={FILTER_OTHER_ROOTS}
      quickPicks={QUICK_PICKS}
      label="Region"
      emptyLabel="All regions"
      className={className}
      testId="region-filter"
    />
  )
}
