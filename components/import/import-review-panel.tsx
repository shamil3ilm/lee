'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ImportApplyResult } from '@/lib/import/result'
import { initialSelection, pickedCount } from '@/lib/import/selection'
import type { ImportItem, ReviewSection, ReviewSelection } from '@/lib/import/types'
import { ImportReview } from './import-review'
import { PortfolioSuggestions } from './portfolio-suggestions'

type Applied = Extract<ImportApplyResult, { ok: true }>

interface ImportReviewPanelProps {
  items: readonly ImportItem[]
  suggestOnly: boolean
  labels?: Partial<Record<ReviewSection, string>>
  /** Apply the ticked items; may also run follow-ups (e.g. connections). */
  onApply: (selection: ReviewSelection) => Promise<ImportApplyResult>
  /** Called after Apply succeeds (and again when the suggestions are dismissed). */
  onDone: (result: Applied | null) => void
  onCancel: () => void
  /** Called right after a successful Apply, before any suggestions show (e.g. refresh the page data). */
  onApplied?: () => void
  /** Extra controls under the review (e.g. LinkedIn connections). */
  children?: React.ReactNode
  /** Allow Apply with nothing ticked (when `children` imports something else). */
  allowEmpty?: boolean
  intro?: React.ReactNode
}

/**
 * Review → Apply → (when public facts come from the portfolio) suggestions.
 * Holds the selection; everything else is the importer's.
 */
export function ImportReviewPanel({ items, suggestOnly, labels, onApply, onDone, onCancel, onApplied, children, allowEmpty = false, intro }: ImportReviewPanelProps) {
  const [selection, setSelection] = useState<ReviewSelection>(() => initialSelection(items))
  const [result, setResult] = useState<Applied | null>(null)
  const [pending, start] = useTransition()
  const count = pickedCount(items, selection)

  const apply = (): void =>
    start(async () => {
      const r = await onApply(selection)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      onApplied?.()
      if (r.mode === 'suggested' && r.snippets.length > 0) {
        setResult(r)
        toast.success('Your portfolio suggestions are ready to copy.')
        return
      }
      toast.success(r.mode === 'saved' ? `Saved ${r.saved} item${r.saved === 1 ? '' : 's'}.` : 'Saved.')
      onDone(r)
    })

  if (result) {
    return <PortfolioSuggestions snippets={result.snippets} profileUrl={result.profileUrl} savedCount={result.saved} onDone={() => onDone(result)} />
  }
  return (
    <div className="space-y-3">
      {intro}
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to import.</p> : null}
      <ImportReview items={items} selection={selection} onChange={setSelection} disabled={pending} labels={labels} suggestOnly={suggestOnly} />
      {children}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Discard
        </Button>
        <Button type="button" onClick={apply} disabled={pending || (count === 0 && !allowEmpty)} data-testid="import-apply">
          {pending ? 'Applying…' : suggestOnly ? `Apply ${count} selected` : `Save ${count} selected`}
        </Button>
      </div>
    </div>
  )
}
