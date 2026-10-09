'use client'
import { Checkbox } from '@/components/ui/checkbox'
import type { Readiness } from '@/lib/import/types'

interface ReadinessToggleProps {
  label: string
  value: Readiness
  disabled?: boolean
  onChange: (r: Readiness) => void
}

/**
 * Readiness for one imported item. Off = "Not ready / learning": the item
 * stays out of variants, tailoring and role suggestions until the user
 * confirms it. On = "Mine — I can explain it" (own, interview-ready).
 */
export function ReadinessToggle({ label, value, disabled, onChange }: ReadinessToggleProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <Checkbox
        checked={value === 'mine'}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked ? 'mine' : 'learning')}
        aria-label={`Mine — I can explain it: ${label}`}
        label={<span className="text-xs">Mine — I can explain it</span>}
      />
      {value === 'learning' ? <span className="text-muted-foreground">Not ready / learning</span> : null}
    </div>
  )
}
