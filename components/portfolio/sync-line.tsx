'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { syncPortfolioAction } from '@/app/(authed)/settings/publish/sync-actions'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/ui/labels'
import type { PullOutcome } from '@/lib/portfolio/pull'

export interface SyncLineProps {
  pulledLabel: string | null
  error: string | null
  editUrl: string | null
}

function announce(o: PullOutcome): void {
  if (o.status === 'pulled') {
    toast.success(o.sections > 0 ? `Synced: ${plural(o.sections, 'section')} updated from your portfolio` : 'Synced: already up to date')
  } else if (o.status === 'unchanged') toast.success('Synced: already up to date')
  else if (o.status === 'missing') toast.error('No profile.json in the repository yet.')
  else if (o.status === 'off') toast.error('Set your portfolio repository (or its canonical URL) first.')
  else if (o.status === 'error') toast.error(o.error)
}

/** "Synced from portfolio · <time>", Sync now, and the GitHub edit link. */
export function SyncLine({ pulledLabel, error, editUrl }: SyncLineProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const sync = (): void =>
    start(async () => {
      const r = await syncPortfolioAction()
      if ('error' in r) toast.error(r.error)
      else announce(r.outcome)
      router.refresh()
    })
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm text-muted-foreground" data-testid="portfolio-sync-status">
          {pulledLabel ? `Synced from portfolio · ${pulledLabel}` : 'Not synced from your portfolio yet.'}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={sync} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
        </Button>
        {editUrl ? (
          <a
            href={editUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-2"
          >
            Edit in your portfolio <ExternalLink className="size-3.5" aria-hidden="true" />
            <span className="sr-only">(opens GitHub)</span>
          </a>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-warning" role="status">
          Last check failed: {error}
        </p>
      ) : null}
    </div>
  )
}
