'use client'
import { useState, useTransition } from 'react'
import { ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { focusRing } from '@/components/ui/focus-ring'
import { setFactorShortlistAction } from '@/app/(authed)/settings/profile/current-job/actions'
import { cn } from '@/lib/utils'

/** Optional: let the comparison nudge the daily shortlist (off by default). */
export function ShortlistFactorCard({ initial, hasCurrent }: { initial: boolean; hasCurrent: boolean }) {
  const [on, setOn] = useState(initial)
  const [pending, start] = useTransition()
  const toggle = (next: boolean): void =>
    start(async () => {
      setOn(next)
      const r = await setFactorShortlistAction(next)
      if ('error' in r) {
        setOn(!next)
        toast.error(r.error)
      } else toast.success(r.message ?? 'Saved')
    })
  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4" aria-hidden="true" />
          Shortlist
        </CardTitle>
        <CardDescription>
          Off by default: the shortlist ranks as usual. When on, the top picks are compared with your current job and move up or
          down by at most 8 points, shown as a “vs current job” reason.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={cn('size-4 rounded border-input accent-primary', focusRing)}
            checked={on}
            disabled={pending || !hasCurrent}
            onChange={(e) => toggle(e.target.checked)}
          />
          Factor the comparison into the shortlist ranking
        </label>
        {!hasCurrent ? <p className="mt-2 text-xs text-muted-foreground">Save your current job first.</p> : null}
      </CardContent>
    </Card>
  )
}
