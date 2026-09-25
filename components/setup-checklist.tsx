'use client'
import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineScript } from '@/components/inline-script'
import { createLocalFlag } from '@/lib/ui/local-flag'
import type { SetupChecklist as SetupChecklistData } from '@/lib/journey/service'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'employ:setup-checklist-dismissed'
const SECTION_ID = 'setup-checklist'
const dismissFlag = createLocalFlag(DISMISS_KEY)

// Pre-paint hide for a completed + dismissed checklist on hard loads.
const HIDE_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  DISMISS_KEY,
)})==="1"){var e=document.getElementById(${JSON.stringify(SECTION_ID)});if(e)e.hidden=true}}catch(e){}})()`

interface SetupChecklistProps {
  checklist: SetupChecklistData
}

export function SetupChecklist({ checklist }: SetupChecklistProps) {
  const dismissed = useSyncExternalStore(
    dismissFlag.subscribe,
    dismissFlag.get,
    dismissFlag.getServer,
  )
  const { items, completed, total } = checklist
  const complete = completed >= total
  // Dismissal only applies once everything is done; an incomplete checklist
  // always shows so setup gaps are never hidden.
  if (complete && dismissed) return null
  const pct = total === 0 ? 100 : Math.round((completed / total) * 100)

  return (
    <section id={SECTION_ID} aria-labelledby="setup-checklist-title" suppressHydrationWarning>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="space-y-1">
            <CardTitle id="setup-checklist-title" className="text-base">
              {complete ? 'You are all set up' : 'Get set up'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {completed} of {total} done
            </p>
          </div>
          {complete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Dismiss setup checklist"
              onClick={() => dismissFlag.set(true)}
            >
              <X />
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            aria-label="Setup progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                    item.done && 'text-muted-foreground line-through',
                  )}
                >
                  {item.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span>{item.label}</span>
                  <span className="sr-only">{item.done ? '(done)' : '(to do)'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {complete ? <InlineScript html={HIDE_SCRIPT} /> : null}
    </section>
  )
}
