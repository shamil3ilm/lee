'use client'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { invertSection, readinessOf, setItem, setReadiness, setSection } from '@/lib/import/selection'
import type { ImportItem, ReviewSelection } from '@/lib/import/types'
import { cn } from '@/lib/utils'

interface SkillChipsProps {
  items: readonly ImportItem[]
  selection: ReviewSelection
  disabled: boolean
  onChange: (next: ReviewSelection) => void
}

/**
 * Skills as toggleable chips (aria-pressed), with All / None / Invert. A
 * ticked new skill shows a "Mine" toggle beside it; untoggled it is
 * imported as "Not ready / learning".
 */
export function SkillChips({ items, selection, disabled, onChange }: SkillChipsProps) {
  const skills = items.filter((i) => i.section === 'skills')
  const on = new Set(selection.picked)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Select skills">
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onChange(setSection(items, selection, 'skills', true))}>
          All
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onChange(setSection(items, selection, 'skills', false))}>
          None
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => onChange(invertSection(items, selection, 'skills'))}>
          Invert
        </Button>
      </div>
      <ul className="flex flex-wrap gap-1.5" data-testid="import-skill-chips">
        {skills.map((s) => {
          const picked = on.has(s.key)
          const mine = readinessOf(selection, s.key) === 'mine'
          return (
            <li key={s.key} className="inline-flex items-stretch overflow-hidden rounded-full border">
              <button
                type="button"
                aria-pressed={picked}
                disabled={disabled}
                onClick={() => onChange(setItem(selection, s.key, !picked))}
                title={s.status === 'duplicate' ? 'Already in lee' : undefined}
                className={cn(
                  'inline-flex min-h-7 items-center gap-1 px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                  picked ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-accent',
                )}
              >
                {picked ? <Check className="size-3" aria-hidden="true" /> : null}
                {s.label}
                {s.status === 'duplicate' ? <span className="sr-only"> (already in lee)</span> : null}
              </button>
              {picked && s.hasReadiness ? (
                <button
                  type="button"
                  aria-pressed={mine}
                  aria-label={`Mine — I can explain it: ${s.label}`}
                  disabled={disabled}
                  onClick={() => onChange(setReadiness(selection, s.key, mine ? 'learning' : 'mine'))}
                  className={cn(
                    'min-h-7 border-l px-2 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    mine ? 'bg-success-soft text-success' : 'bg-card text-muted-foreground hover:bg-accent',
                  )}
                >
                  {mine ? 'Mine' : 'Learning'}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Skills are imported as “Learning” (not used in CVs or suggestions) until you mark them “Mine”. Greyed-out skills are already in lee.
      </p>
    </div>
  )
}
