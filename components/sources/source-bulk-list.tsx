'use client'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { SourceRow, type SourceRowItem } from '@/components/source-row'
import { checkSourcesNow, setSourcesEnabled, type BulkActionResult } from '@/app/(authed)/settings/sources/bulk-actions'
import {
  SOURCE_GROUPS,
  SOURCE_GROUP_LABELS,
  bulkPlan,
  headerState,
  quickSelectCounts,
  quickSelectIds,
  toggleAll,
  toggleOne,
  type QuickSelect,
  type SelectableSource,
} from '@/lib/sources/selection'
import { CAPACITY_NOTE_MIN_TURN_ON, capacityNote, checkInterval } from '@/lib/sources/check-interval'
import { BulkActionBar } from './bulk-action-bar'

export interface BulkSourceRow extends SourceRowItem, SelectableSource {
  blocker: string | null
  /** Expected poll time (observed average, else the default). */
  costMs: number
}

interface SourceBulkListProps {
  rows: readonly BulkSourceRow[]
  /** Lane time a day the plan gives this user's polls (lib/queue/capacity.ts). */
  pollBudgetMs: number
}

const CHIP = 'h-8 rounded-full px-3'

/** The capacity note for a selection that turns sources on, or null. */
function noteFor(rows: readonly BulkSourceRow[], turnOn: readonly string[], budgetMs: number): string | null {
  if (turnOn.length === 0) return null
  const on = new Set(turnOn)
  const interval = checkInterval(
    rows.filter((r) => !r.blocker && (r.enabled || on.has(r.id))).map((r) => r.costMs),
    budgetMs,
  )
  return turnOn.length >= CAPACITY_NOTE_MIN_TURN_ON || interval.everyDays > 1 ? capacityNote(interval) : null
}

/**
 * Settings › Sources › Your sources with bulk selection: a checkbox per
 * row, a tri-state "Select all", quick-select chips (all, none, switched
 * off, starred regions, by type) and an action bar while anything is
 * selected — Turn on, Turn off, Check now.
 */
export function SourceBulkList({ rows, pollBudgetMs }: SourceBulkListProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [pending, start] = useTransition()
  const typeLabelId = useId()
  const header = headerState(rows, selected)
  const plan = bulkPlan(rows, selected)
  const counts = quickSelectCounts(rows)

  const pick = (preset: QuickSelect): void => setSelected(quickSelectIds(rows, preset))
  const run = (action: () => Promise<BulkActionResult>): void =>
    start(async () => {
      const r = await action()
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(r.message)
      setSelected(new Set())
    })

  const chip = (preset: QuickSelect, label: string, count: number | null, testId: string) => (
    <Button
      key={preset}
      type="button"
      variant="outline"
      size="sm"
      className={CHIP}
      onClick={() => pick(preset)}
      data-testid={testId}
    >
      {label}
      {count === null ? null : <span className="tabular-nums text-muted-foreground">{count}</span>}
    </Button>
  )

  return (
    <div className="space-y-2">
      <div className="space-y-2 px-1">
        <Checkbox
          id="sources-select-all"
          checked={header.checked}
          indeterminate={header.indeterminate}
          onChange={() => setSelected(toggleAll(rows, selected))}
          label={header.count > 0 ? `${header.count} of ${rows.length} selected` : `Select all ${rows.length}`}
          data-testid="sources-select-all"
        />
        <div role="group" aria-label="Quick select" className="flex flex-wrap items-center gap-1.5">
          {chip('all', 'All', null, 'sources-pick-all')}
          {chip('none', 'None', null, 'sources-pick-none')}
          {counts.off > 0 ? chip('off', 'Switched off', counts.off, 'sources-pick-off') : null}
          {counts.starred > 0 ? chip('starred', 'In my starred regions', counts.starred, 'sources-pick-starred') : null}
        </div>
        <div role="group" aria-labelledby={typeLabelId} className="flex flex-wrap items-center gap-1.5">
          <span id={typeLabelId} className="text-xs text-muted-foreground">
            By type
          </span>
          {SOURCE_GROUPS.filter((g) => counts.groups[g] > 0).map((g) =>
            chip(`type:${g}`, SOURCE_GROUP_LABELS[g], counts.groups[g], `sources-pick-${g}`),
          )}
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {header.count === 0 ? 'No sources selected' : `${header.count} of ${rows.length} sources selected`}
        </p>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          // Keyed on `enabled` too so a change that flips it remounts the
          // row's optimistic toggle state from fresh props.
          <SourceRow
            key={`${r.id}-${r.enabled}`}
            source={r}
            selected={selected.has(r.id)}
            onSelectedChange={(on) => setSelected((prev) => toggleOne(prev, r.id, on))}
          />
        ))}
      </div>
      {plan.selected > 0 ? (
        <>
          {/* Room under the last row for the phone's fixed bottom bar. */}
          <div aria-hidden="true" className="h-48 sm:hidden" />
          <BulkActionBar
            plan={plan}
            pending={pending}
            capacityNote={noteFor(rows, plan.turnOn, pollBudgetMs)}
            onTurnOn={() => run(() => setSourcesEnabled(plan.turnOn, true))}
            onTurnOff={() => run(() => setSourcesEnabled(plan.turnOff, false))}
            onCheck={() => run(() => checkSourcesNow(plan.check))}
            onClear={() => setSelected(new Set())}
          />
        </>
      ) : null}
    </div>
  )
}
