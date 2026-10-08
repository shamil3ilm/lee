'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setLearnedTitleAction } from '@/app/(authed)/settings/profile/relevance-actions'
import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import type { SearchPrefsFormValues } from '@/lib/discovery/relevance/view'

/**
 * Titles lee learned from "Show anyway", saves and "Not my field". Each
 * can be flipped or forgotten; changes re-check the inbox in the background.
 */
export function LearnedTitles({ titles }: { titles: SearchPrefsFormValues['learnedTitles'] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (key: string, related: boolean | null): void =>
    start(async () => {
      const r = await setLearnedTitleAction(key, related)
      if ('error' in r) toast.error(r.error)
      router.refresh()
    })
  return (
    <fieldset className="space-y-2" data-testid="learned-titles">
      <legend className="text-sm font-medium">Titles lee learned</legend>
      {titles.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          None yet. “Show anyway”, saving an uncertain posting, or “Not for me → Not my field” teaches lee a title.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {titles.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{t.key}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {t.related ? `related${t.family ? ` (${roleFamilyLabel(t.family)})` : ''}` : 'not my field'}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Button type="button" size="sm" variant="ghost" className="h-7" disabled={pending} onClick={() => run(t.key, !t.related)}>
                  {t.related ? 'Mark unrelated' : 'Mark related'}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={pending} onClick={() => run(t.key, null)} aria-label={`Forget ${t.key}`}>
                  <X className="size-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
