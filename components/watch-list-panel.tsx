'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BellOff, BellRing, ExternalLink, Loader2, Trash2, X } from 'lucide-react'
import { removeSource } from '@/app/(authed)/settings/sources/actions'
import { setWatchReminders } from '@/app/(authed)/settings/sources/bulk-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { toggleOne } from '@/lib/sources/selection'

export interface WatchItem {
  id: string
  name: string
  url: string
  reason: string | null
  /** Weekly "check this" reminder (config.watching; default on). */
  watching: boolean
}

/**
 * Settings › Sources › "Check these yourself": careers pages and portals
 * lee may not fetch (their terms or robots.txt forbid it, or there's no
 * public feed). Just a link and the reason — no request is ever made.
 * Select links (or all of them) to turn their weekly reminders on or off.
 */
export function WatchListPanel({ items }: { items: WatchItem[] }) {
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  if (items.length === 0) return null

  const picked = items.filter((i) => selected.has(i.id))
  const all = picked.length === items.length
  const turnOn = picked.filter((i) => !i.watching).map((i) => i.id)
  const turnOff = picked.filter((i) => i.watching).map((i) => i.id)

  const remove = (id: string): void => {
    startTransition(async () => {
      const r = await removeSource(id)
      if ('success' in r) toast.success('Removed from the watch list')
      else toast.error(r.error)
    })
  }

  const remind = (ids: string[], watching: boolean): void => {
    startTransition(async () => {
      const r = await setWatchReminders(ids, watching)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success(r.message)
      setSelected(new Set())
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        lee doesn&apos;t fetch these sites: their terms or robots.txt don&apos;t allow automated access, or there&apos;s no
        public feed. Open them now and then; where the site sends job alerts, set one up and lee picks the jobs up from your
        email.
      </p>
      <div className="px-1">
        <Checkbox
          id="watch-select-all"
          checked={all}
          indeterminate={picked.length > 0 && !all}
          onChange={() => setSelected(all ? new Set() : new Set(items.map((i) => i.id)))}
          label={picked.length > 0 ? `${picked.length} of ${items.length} selected` : `Select all ${items.length}`}
          data-testid="watch-select-all"
        />
      </div>
      {picked.length > 0 ? (
        <div
          role="region"
          aria-label="Actions for the selected links"
          data-testid="watch-bulk-bar"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSelected(new Set())
          }}
          className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm"
        >
          <span className="px-1 text-sm font-medium tabular-nums">{picked.length} selected</span>
          <Button
            type="button"
            size="sm"
            className="h-10 sm:h-8"
            disabled={isPending || turnOn.length === 0}
            onClick={() => remind(turnOn, true)}
            data-testid="watch-bulk-on"
          >
            {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <BellRing aria-hidden="true" />}
            Turn on weekly reminders ({turnOn.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 sm:h-8"
            disabled={isPending || turnOff.length === 0}
            onClick={() => remind(turnOff, false)}
            data-testid="watch-bulk-off"
          >
            <BellOff aria-hidden="true" />
            Turn off ({turnOff.length})
          </Button>
          <Button type="button" size="sm" variant="ghost" className="ml-auto h-10 sm:h-8" disabled={isPending} onClick={() => setSelected(new Set())}>
            <X aria-hidden="true" />
            Clear
          </Button>
        </div>
      ) : null}
      <ul className="divide-y rounded-md border text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 px-3 py-2">
            <Checkbox
              className="mt-1"
              checked={selected.has(item.id)}
              onChange={(e) => setSelected((prev) => toggleOne(prev, item.id, e.target.checked))}
              aria-label={`Select ${item.name}`}
              data-testid="watch-select"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                >
                  {item.name} <ExternalLink className="size-3" aria-hidden="true" />
                </a>
                <Badge variant="slate" data-testid="watch-reminder">
                  {item.watching ? 'Weekly reminder' : 'No reminder'}
                </Badge>
              </div>
              {item.reason ? <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p> : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 p-0"
              disabled={isPending}
              onClick={() => remove(item.id)}
              aria-label={`Remove ${item.name} from the watch list`}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
