'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Building2, ExternalLink, MailPlus } from 'lucide-react'
import { toggleSourceEnabled, updateEmployerWatch } from '@/app/(authed)/settings/sources/actions'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import type { EmployerWatchRow, WatchStatus } from '@/lib/defaults/watch-status'
import type { WatchMethod } from '@/lib/defaults/watch-employers'
import { shortDate } from '@/lib/ui/date'

const COUNTRY: Readonly<Record<string, string>> = {
  AE: 'United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman',
}

const METHOD_LABEL: Readonly<Record<WatchMethod, string>> = {
  adapter: 'Polled daily',
  alert: 'Job alerts',
  ai_search: 'AI search',
  manual: 'Check weekly',
}

const STATUS: Readonly<Record<WatchStatus, { label: string; variant: BadgeProps['variant'] }>> = {
  polling: { label: 'Polling', variant: 'success' },
  waiting: { label: 'First poll pending', variant: 'info' },
  error: { label: 'Poll failed', variant: 'danger' },
  off: { label: 'Off', variant: 'neutral' },
  check_due: { label: 'Check due', variant: 'warning' },
  checked: { label: 'Checked', variant: 'success' },
  not_added: { label: 'Not added', variant: 'outline' },
}

function lastSeenLine(row: EmployerWatchRow): string {
  if (row.polled) return row.lastSeenAt ? `Last opening ${shortDate(row.lastSeenAt)}` : 'No openings seen yet'
  return row.lastCheckedAt ? `Checked ${shortDate(row.lastCheckedAt)}` : 'Not checked yet'
}

function EmployerRow({ row }: { row: EmployerWatchRow }) {
  const [isPending, startTransition] = useTransition()
  const status = STATUS[row.status]

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
    <li className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-start" data-testid="employer-watch-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={row.careersUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
          >
            {row.name} <ExternalLink className="size-3" aria-hidden="true" />
          </a>
          <Badge variant={status.variant}>{status.label}</Badge>
          <Badge variant="outline">{row.backend}</Badge>
          {row.methods.map((m) => (
            <Badge key={m} variant="neutral">
              {METHOD_LABEL[m]}
            </Badge>
          ))}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {lastSeenLine(row)} · {row.note}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {row.alertSignupUrl ? (
          <Button asChild size="sm" variant="ghost" className="h-8">
            <a href={row.alertSignupUrl} target="_blank" rel="noopener noreferrer">
              <MailPlus className="size-4" aria-hidden="true" /> Alerts
            </a>
          </Button>
        ) : null}
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
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={row.watching}
            onChange={toggle}
            disabled={isPending || !row.sourceId}
            aria-label={`${row.watching ? 'Stop watching' : 'Watch'} ${row.name}`}
          />
          <span
            className={[
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
              row.watching ? 'bg-primary' : 'bg-muted',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-4 w-4 transform rounded-full bg-card shadow ring-1 ring-border transition-transform',
                row.watching ? 'translate-x-4' : 'translate-x-0.5',
              ].join(' ')}
            />
          </span>
          <span>{row.watching ? 'On' : 'Off'}</span>
        </label>
      </div>
    </li>
  )
}

/**
 * Settings › Sources › GCC employer watch list: government, semi-government
 * and major Gulf employers, each with how lee watches it (polled careers
 * site, job alerts, AI search, or a weekly look) and where that stands.
 */
export function EmployerWatchPanel({ rows }: { rows: EmployerWatchRow[] }) {
  if (rows.length === 0) return null
  const countries = [...new Set(rows.map((r) => r.country))]
  return (
    <section id="employer-watch" aria-labelledby="employer-watch-title" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <h2 id="employer-watch-title" className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            GCC employer watch list
          </h2>
          <CardDescription>
            Government, semi-government and major Gulf employers. Where a careers site has a public feed, lee polls
            it daily; otherwise set up the employer&apos;s job alerts, let AI search look, or open the site weekly and
            mark it checked. Nationals-only openings are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {countries.map((c) => (
            <div key={c}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{COUNTRY[c] ?? c}</h3>
              <ul className="divide-y rounded-md border text-sm">
                {rows
                  .filter((r) => r.country === c)
                  .map((r) => (
                    <EmployerRow key={r.key} row={r} />
                  ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
