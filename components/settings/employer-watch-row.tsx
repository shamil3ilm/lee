'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { ExternalLink, MailPlus } from 'lucide-react'
import { toggleSourceEnabled, updateEmployerWatch } from '@/app/(authed)/settings/sources/actions'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Disclosure } from '@/components/settings/disclosure'
import type { EmployerWatchRow as Row, WatchStatus } from '@/lib/defaults/watch-status'
import { howLeeChecks, otherMethods } from '@/lib/defaults/watch-filter'
import { shortDate } from '@/lib/ui/date'

/** One status per row: an employer that isn't added has no on/off state. */
const STATUS: Readonly<Record<WatchStatus, { label: string; variant: BadgeProps['variant'] }>> = {
  polling: { label: 'Polling', variant: 'success' },
  waiting: { label: 'First poll pending', variant: 'info' },
  error: { label: 'Poll failed', variant: 'danger' },
  off: { label: 'Off', variant: 'neutral' },
  check_due: { label: 'Check due', variant: 'warning' },
  checked: { label: 'Checked', variant: 'success' },
  not_added: { label: 'Not added', variant: 'neutral' },
}

function lastSeenLine(row: Row): string {
  if (row.polled) return row.lastSeenAt ? `Last opening ${shortDate(row.lastSeenAt)}` : 'No openings seen yet'
  return row.lastCheckedAt ? `Checked ${shortDate(row.lastCheckedAt)}` : 'Not checked yet'
}

export function EmployerWatchRow({ row }: { row: Row }) {
  const [isPending, startTransition] = useTransition()
  const status = STATUS[row.status]
  const extra = otherMethods(row.methods)

  const run = (fn: () => Promise<{ success: true } | { error: string }>, done: string): void => {
    startTransition(async () => {
      const r = await fn()
      if ('success' in r) toast.success(done)
      else toast.error(r.error)
    })
  }

  const toggle = (): void => {
    if (!row.sourceId) return
    const id = row.sourceId
    const next = !row.watching
    run(
      () => (row.polled ? toggleSourceEnabled(id, next) : updateEmployerWatch(id, { watching: next })),
      next ? `Watching ${row.name}` : `Stopped watching ${row.name}`,
    )
  }

  return (
    <li className="px-3 py-2" data-testid="employer-watch-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <a
          href={row.careersUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
        >
          <span className="truncate">{row.name}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        </a>
        <span className="text-xs text-muted-foreground">{howLeeChecks(row.methods)}</span>
        <Badge variant={status.variant}>{status.label}</Badge>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!row.polled && row.sourceId && row.watching ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={isPending}
              onClick={() => run(() => updateEmployerWatch(row.sourceId!, { checked: true }), `Marked ${row.name} as checked`)}
            >
              Checked
            </Button>
          ) : null}
          {row.sourceId ? (
            <Switch
              checked={row.watching}
              onChange={toggle}
              disabled={isPending}
              aria-label={`Watch ${row.name}`}
            />
          ) : null}
        </div>
      </div>
      <Disclosure label="Details" className="mt-1">
        <dl className="grid gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[auto_1fr]">
          <dt className="font-medium text-foreground">Last activity</dt>
          <dd>{lastSeenLine(row)}</dd>
          <dt className="font-medium text-foreground">Careers site</dt>
          <dd>{row.backend}</dd>
          {extra.length > 0 ? (
            <>
              <dt className="font-medium text-foreground">Also</dt>
              <dd>{extra.join(', ')}</dd>
            </>
          ) : null}
          {row.note ? (
            <>
              <dt className="font-medium text-foreground">Notes</dt>
              <dd>{row.note}</dd>
            </>
          ) : null}
        </dl>
        {row.alertSignupUrl ? (
          <Button asChild size="sm" variant="ghost" className="mt-1 h-8 px-2">
            <a href={row.alertSignupUrl} target="_blank" rel="noopener noreferrer">
              <MailPlus className="size-4" aria-hidden="true" /> Set up job alerts
            </a>
          </Button>
        ) : null}
      </Disclosure>
    </li>
  )
}
