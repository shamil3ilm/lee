'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { enableRegionSources } from '@/app/(authed)/settings/sources/actions'
import type { CoverageStatus } from '@/lib/coverage/compute'
import type { CoverageRowView } from '@/lib/coverage/view'

export type { CoverageRowView }

const STATUS_LABEL: Readonly<Record<CoverageStatus, string>> = { green: 'Good', amber: 'Low', red: 'None' }
const STATUS_VARIANT: Readonly<Record<CoverageStatus, 'success' | 'warning' | 'danger'>> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function EnableButton({ regionId, count, label }: { regionId: string; count: number; label: string }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  if (done) return <span className="text-xs text-muted-foreground">Turned on</span>
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await enableRegionSources(regionId)
          if ('error' in r) {
            toast.error(r.error)
            return
          }
          setDone(true)
          toast.success(`${plural(r.count ?? count, `${label} board`)} on; first search queued.`)
        })
      }
    >
      {pending ? 'Turning on…' : `Turn on ${plural(count, 'board')}`}
    </Button>
  )
}

function Row({ row }: { row: CoverageRowView }) {
  return (
    <li className="space-y-2 rounded-md border p-3" data-testid={`coverage-${row.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.label}</span>
        {row.starred ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3" aria-hidden="true" />
            {row.starred === 'top' ? 'Top priority' : 'Preferred'}
          </span>
        ) : null}
        <Badge variant={STATUS_VARIANT[row.status]} className="ml-auto">
          {STATUS_LABEL[row.status]} coverage
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {plural(row.regionSources, `${row.label} source`)} on · {plural(row.broadSources, 'broad source')} ·{' '}
        {plural(row.setupSources, 'alert source')}. This week: {plural(row.kept, 'job')} kept, {row.filtered} filtered;{' '}
        {plural(row.companies, 'company', 'companies')}.
      </p>
      <p className="text-xs text-muted-foreground">{row.why}</p>
      {row.suggestions.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2" aria-label={`Next steps for ${row.label}`}>
          {row.suggestions.map((s) => (
            <li key={s.kind}>
              {s.kind === 'enable' ? (
                <EnableButton regionId={row.id} count={row.available} label={row.label} />
              ) : s.href ? (
                <a
                  href={s.href}
                  {...(s.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                >
                  {s.text}
                  {s.href.startsWith('http') ? <ExternalLink className="size-3" aria-hidden="true" /> : null}
                </a>
              ) : (
                <span className="text-xs">{s.text}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/**
 * Settings › Sources › Coverage: every region in the user's preferences
 * (starred first) with a green / amber / red status, how many sources can
 * yield it and what the last week brought, plus one-click next steps.
 */
export function CoveragePanel({ rows }: { rows: CoverageRowView[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Choose target regions in Settings › Search to see coverage.</p>
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Good: 3+ sources for the region and 5+ new jobs a week. Low: fewer. None: no source lists the region yet. lee
        suggests; nothing changes until you click.
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <Row key={r.id} row={r} />
        ))}
      </ul>
    </div>
  )
}
