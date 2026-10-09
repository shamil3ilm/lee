'use client'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import type { ImportItem, Readiness } from '@/lib/import/types'
import { ReadinessToggle } from './readiness-toggle'

export const STATUS_BADGE: Readonly<Record<ImportItem['status'], { label: string; variant: 'success' | 'neutral' | 'info' }>> = {
  new: { label: 'New', variant: 'success' },
  duplicate: { label: 'Already in lee', variant: 'neutral' },
  update: { label: 'Update', variant: 'info' },
}

interface ReviewRowProps {
  item: ImportItem
  picked: boolean
  readiness: Readiness
  disabled: boolean
  onPick: (on: boolean) => void
  onReadiness: (r: Readiness) => void
}

/** The diff of an update and the keep-mine / take-imported choice (ticked = take imported). */
function UpdateChoice({ item, picked, disabled, onPick }: Pick<ReviewRowProps, 'item' | 'picked' | 'disabled' | 'onPick'>) {
  const name = `update-${item.key}`
  return (
    <div className="mt-1.5 space-y-1.5 rounded-md border bg-muted/30 p-2 text-xs">
      <dl className="grid gap-1 sm:grid-cols-[8rem_1fr]">
        {item.diff.map((d) => (
          <div key={d.field} className="contents">
            <dt className="font-medium text-muted-foreground">{d.label}</dt>
            <dd className="min-w-0 break-words">
              <span className="text-muted-foreground line-through decoration-muted-foreground/60">{d.mine || '(empty)'}</span>
              <span aria-hidden="true"> → </span>
              <span className="sr-only"> becomes </span>
              <span>{d.imported}</span>
            </dd>
          </div>
        ))}
      </dl>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
        <legend className="sr-only">{`${item.label}: keep mine or take imported`}</legend>
        <label className="inline-flex min-h-6 items-center gap-1.5">
          <input type="radio" name={name} className="size-4 accent-[hsl(var(--primary))]" checked={!picked} disabled={disabled} onChange={() => onPick(false)} />
          Keep mine
        </label>
        <label className="inline-flex min-h-6 items-center gap-1.5">
          <input type="radio" name={name} className="size-4 accent-[hsl(var(--primary))]" checked={picked} disabled={disabled} onChange={() => onPick(true)} />
          Take imported
        </label>
      </fieldset>
    </div>
  )
}

/** One experience / project / education / certification / link row. */
export function ReviewRow({ item, picked, readiness, disabled, onPick, onReadiness }: ReviewRowProps) {
  const badge = STATUS_BADGE[item.status]
  return (
    <li className="py-1.5" data-testid="import-row" data-key={item.key}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <Checkbox
          checked={picked}
          disabled={disabled}
          onChange={(e) => onPick(e.currentTarget.checked)}
          className="min-w-0 flex-1"
          aria-label={item.status === 'update' ? `Take imported ${item.label}` : undefined}
          label={
            <span className="break-words">
              {item.label}
              {item.detail ? <span className="text-muted-foreground"> · {item.detail}</span> : null}
            </span>
          }
        />
        <Badge variant={badge.variant} className="shrink-0 text-[10px]">
          {badge.label}
        </Badge>
      </div>
      {item.status === 'update' ? <UpdateChoice item={item} picked={picked} disabled={disabled} onPick={onPick} /> : null}
      {item.hasReadiness && picked ? (
        <div className="ml-6 mt-1">
          <ReadinessToggle label={item.label} value={readiness} disabled={disabled} onChange={onReadiness} />
        </div>
      ) : null}
    </li>
  )
}
