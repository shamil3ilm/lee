'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { markTitlesRelatedAction } from '@/app/(authed)/settings/profile/relevance-actions'

export interface FilterReviewItem {
  key: string
  title: string
  domain: string
  count: number
}

/**
 * Filtered tab: "Did we filter something useful?" — the week's top titles
 * the domain rule filtered. "These are related" restores them and teaches
 * lee the title.
 */
export function FilterReview({ items }: { items: readonly FilterReviewItem[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (items.length === 0) return null
  const related = (key: string): void =>
    start(async () => {
      const r = await markTitlesRelatedAction(key)
      if ('error' in r) toast.error(r.error)
      else toast.success(`Restored ${r.count ?? 0} and learned the title`)
      router.refresh()
    })
  return (
    <section aria-label="Did we filter something useful?" data-testid="filter-review" className="rounded-lg border bg-card p-3 text-sm">
      <h2 className="font-medium">Did we filter something useful?</h2>
      <p className="text-xs text-muted-foreground">Titles the domain rule filtered this week.</p>
      <ul className="mt-2 divide-y">
        {items.map((i) => (
          <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span className="min-w-0">
              <span className="font-medium">{i.title}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                {i.domain} · {i.count} {i.count === 1 ? 'posting' : 'postings'}
              </span>
            </span>
            <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={() => related(i.key)}>
              These are related
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
