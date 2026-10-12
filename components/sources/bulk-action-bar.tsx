'use client'
import { Loader2, Power, PowerOff, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BulkPlan } from '@/lib/sources/selection'

interface BulkActionBarProps {
  plan: BulkPlan
  pending: boolean
  /** "lee checks the stalest sources first each day; …", or null. */
  capacityNote: string | null
  onTurnOn: () => void
  onTurnOff: () => void
  onCheck: () => void
  onClear: () => void
}

const MAX_NAMES = 2

function namesLine(names: readonly string[]): string {
  const shown = names.slice(0, MAX_NAMES).join(', ')
  return names.length > MAX_NAMES ? `${shown} and ${names.length - MAX_NAMES} more` : shown
}

/**
 * The bar shown while sources are selected: a bottom bar on phones (thumb
 * reach, safe-area padding), sticky under the list on larger screens.
 * Escape clears the selection.
 */
export function BulkActionBar({ plan, pending, capacityNote, onTurnOn, onTurnOff, onCheck, onClear }: BulkActionBarProps) {
  const blocked = plan.blocked.reduce((s, g) => s + g.names.length, 0)
  const spinner = pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null
  return (
    <div
      role="region"
      aria-label="Actions for the selected sources"
      data-testid="sources-bulk-bar"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClear()
      }}
      className="fixed inset-x-0 bottom-0 z-40 space-y-2 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg sm:sticky sm:inset-x-auto sm:bottom-4 sm:rounded-xl sm:border sm:pb-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-1 text-sm font-medium tabular-nums">{plan.selected} selected</span>
        <Button
          type="button"
          size="sm"
          className="h-10 sm:h-8"
          disabled={pending || plan.turnOn.length === 0}
          onClick={onTurnOn}
          data-testid="sources-bulk-on"
        >
          {spinner ?? <Power aria-hidden="true" />}
          Turn on {plan.turnOn.length}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10 sm:h-8"
          disabled={pending || plan.turnOff.length === 0}
          onClick={onTurnOff}
          data-testid="sources-bulk-off"
        >
          <PowerOff aria-hidden="true" />
          Turn off {plan.turnOff.length}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10 sm:h-8"
          disabled={pending || plan.check.length === 0}
          onClick={onCheck}
          // Starts with the visible "Check now" (WCAG 2.5.3 label in name).
          aria-label={`Check now: ${plan.check.length} ${plan.check.length === 1 ? 'source' : 'sources'}`}
          data-testid="sources-bulk-check"
        >
          <RefreshCw aria-hidden="true" />
          Check now
        </Button>
        <Button type="button" size="sm" variant="ghost" className="ml-auto h-10 sm:h-8" disabled={pending} onClick={onClear}>
          <X aria-hidden="true" />
          Clear
        </Button>
      </div>
      {blocked > 0 ? (
        <div className="px-1 text-xs text-muted-foreground" data-testid="sources-bulk-blocked">
          <p className="font-medium text-foreground">
            {blocked} can&apos;t be turned on:
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {plan.blocked.map((g) => (
              <li key={g.reason}>
                {g.reason} ({namesLine(g.names)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {capacityNote ? (
        <p className="px-1 text-xs text-muted-foreground" data-testid="sources-capacity-note">
          {capacityNote}
        </p>
      ) : null}
    </div>
  )
}
