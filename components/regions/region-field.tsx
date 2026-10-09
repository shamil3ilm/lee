'use client'
import * as React from 'react'
import { SETTINGS_ROOTS } from '@/lib/regions/taxonomy'
import { RegionPicker } from './region-picker'

interface RegionFieldProps {
  /** Form field name; one hidden input per selected node id. */
  name: string
  defaultValue: readonly string[]
  label: string
}

const SETTINGS_QUICK_PICKS = ['gcc', 'ae', 'in', 'kerala', 'bengaluru'] as const

/**
 * Target regions in a server-action form (Settings › Search): the
 * hierarchical picker plus hidden inputs, so the form posts node ids
 * ("gcc", "kerala", "dubai") like any other field.
 */
export function RegionField({ name, defaultValue, label }: RegionFieldProps) {
  const [value, setValue] = React.useState<readonly string[]>(defaultValue)
  return (
    <div className="space-y-2" data-testid="target-regions">
      <RegionPicker
        value={value}
        onChange={setValue}
        roots={SETTINGS_ROOTS}
        quickPicks={SETTINGS_QUICK_PICKS}
        label={label}
        emptyLabel="Choose regions"
        testId="target-regions-picker"
      />
      {value.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  )
}
