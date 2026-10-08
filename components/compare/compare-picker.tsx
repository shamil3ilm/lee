'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface PickerOption {
  key: string
  label: string
  meta: string
}

export interface PickerGroupData {
  title: string
  options: readonly PickerOption[]
  /** Span both columns from `lg` up. */
  wide?: boolean
}

interface ComparePickerProps {
  groups: readonly PickerGroupData[]
  selected: readonly string[]
  max: number
}

/** "2 of 3 selected", or the rule itself when nothing is picked yet. */
export function selectionText(count: number, max: number): string {
  if (count === 0) return `Pick up to ${max} jobs`
  return `${count} of ${max} selected`
}

/**
 * The /compare picker: a GET form (so the comparison stays a shareable URL)
 * that counts picks, disables further boxes once the limit is reached and
 * says why, and keeps the Compare action in a sticky footer.
 */
export function ComparePicker({ groups, selected, max }: ComparePickerProps) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(selected.slice(0, max)))
  const full = picked.size >= max

  const toggle = (key: string, on: boolean): void =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  return (
    <form method="get" action="/compare" className="space-y-4" aria-describedby="compare-limit">
      <p id="compare-limit" className="text-xs text-muted-foreground">
        Pick up to {max}. Your current job is always the baseline.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((g) =>
        g.options.length === 0 ? null : (
          <fieldset key={g.title} className={cn('min-w-0 space-y-2', g.wide && 'lg:col-span-2')}>
            <legend className="text-sm font-semibold">{g.title}</legend>
            <ul className="divide-y rounded-lg border">
              {g.options.map((o) => {
                const checked = picked.has(o.key)
                const locked = full && !checked
                return (
                  <li key={o.key}>
                    <label
                      className={cn(
                        'flex items-start gap-3 px-3 py-2 text-sm',
                        locked ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer hover:bg-accent',
                      )}
                      title={locked ? `You can compare up to ${max} jobs. Untick one to pick this.` : undefined}
                    >
                      <input
                        type="checkbox"
                        name="ids"
                        value={o.key}
                        checked={checked}
                        disabled={locked}
                        onChange={(e) => toggle(o.key, e.target.checked)}
                        className="mt-1 size-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{o.label}</span>
                        {o.meta ? <span className="block truncate text-xs text-muted-foreground">{o.meta}</span> : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        ),
      )}
      </div>
      <div
        className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t bg-card/95 px-6 py-3 backdrop-blur"
        data-testid="compare-footer"
      >
        <p className="text-sm" aria-live="polite">
          <span className="font-medium tabular-nums" data-testid="compare-count">
            {selectionText(picked.size, max)}
          </span>
          {full ? <span className="block text-xs text-muted-foreground">Limit reached. Untick one to swap it.</span> : null}
        </p>
        <Button type="submit" size="sm" disabled={picked.size === 0}>
          Compare
        </Button>
      </div>
    </form>
  )
}
