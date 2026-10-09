'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, Loader2, ThumbsDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { bulkCompanyAction } from '@/app/(authed)/discoveries/company-actions'
import { CompanyRow } from './company-row'
import type { CompanyCardData } from './types'

/**
 * The company rows with bulk selection: tick rows (or the whole page), then
 * Watch or Not interested for all of them. The bar sticks to the bottom of
 * the screen on phones so it stays in thumb reach while scrolling.
 */
export function CompanyList({ cards, dismissedView }: { cards: readonly CompanyCardData[]; dismissedView: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [pending, start] = useTransition()
  // Rows that left the page (dismissed, watched) leave the selection too.
  const live = new Set(cards.map((c) => c.id))
  const picked = [...selected].filter((id) => live.has(id))
  const all = cards.length > 0 && picked.length === cards.length

  const toggle = (id: string, on: boolean): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const bulk = (action: 'watch' | 'dismiss'): void =>
    start(async () => {
      const r = await bulkCompanyAction(picked, action)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Done')
      setSelected(new Set())
      router.refresh()
    })

  return (
    <div className="space-y-2">
      <div className="flex min-h-10 flex-wrap items-center gap-2 px-1">
        <Checkbox
          id="company-select-all"
          checked={all}
          indeterminate={picked.length > 0 && !all}
          onChange={(e) => setSelected(e.target.checked ? new Set(cards.map((c) => c.id)) : new Set())}
          label={picked.length > 0 ? `${picked.length} selected` : 'Select all on this page'}
          data-testid="company-select-all"
        />
      </div>
      {picked.length > 0 && !dismissedView ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-lg md:top-2 md:bottom-auto"
          data-testid="company-bulk-bar"
        >
          <span className="px-1 text-sm font-medium tabular-nums">{picked.length} selected</span>
          <Button size="sm" className="h-10 md:h-8" disabled={pending} onClick={() => bulk('watch')} data-testid="company-bulk-watch">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Bell className="size-4" aria-hidden="true" />}
            Watch
          </Button>
          <Button size="sm" variant="outline" className="h-10 md:h-8" disabled={pending} onClick={() => bulk('dismiss')} data-testid="company-bulk-dismiss">
            <ThumbsDown className="size-4" aria-hidden="true" />
            Not interested
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto h-10 md:h-8" disabled={pending} onClick={() => setSelected(new Set())}>
            <X className="size-4" aria-hidden="true" />
            Clear
          </Button>
        </div>
      ) : null}
      <ul className="space-y-2" aria-label="Companies">
        {cards.map((c) => (
          <CompanyRow key={c.id} c={c} selected={selected.has(c.id)} onSelect={(on) => toggle(c.id, on)} />
        ))}
      </ul>
    </div>
  )
}
