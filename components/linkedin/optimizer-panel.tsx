'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { suggestProfileAction } from '@/app/(authed)/settings/linkedin/actions'
import type { CheckItem } from '@/lib/integrations/linkedin/optimizer'
import { CopyButton } from './copy-button'

interface OptimizerPanelProps {
  imported: boolean
  checklist: CheckItem[]
}

const ICON = {
  pass: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" />,
  warn: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="To improve" />,
  info: <Info className="mt-0.5 size-4 shrink-0 text-info" aria-label="Advice" />,
} as const

/** Profile optimizer: checklist + fact-locked rewrite suggestions with copy buttons. */
export function OptimizerPanel({ imported, checklist }: OptimizerPanelProps) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ headlines: string[]; about: string | null; dropped: number } | null>(null)

  const suggest = (): void => {
    start(async () => {
      const r = await suggestProfileAction()
      if (r.ok) setResult({ headlines: r.headlines, about: r.about, dropped: r.dropped })
      else toast.error(r.error)
    })
  }

  return (
    <div className="space-y-4 text-sm">
      {!imported ? <p className="text-muted-foreground">Import your LinkedIn export to compare your LinkedIn profile with your CV.</p> : null}
      <ul className="space-y-2" data-testid="linkedin-checklist">
        {checklist.map((c) => (
          <li key={c.id} className="flex gap-2">
            {ICON[c.status]}
            <div>
              <div className="font-medium">{c.title}</div>
              <div className="text-xs text-muted-foreground">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="space-y-3 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          Suggestions are written from your best CV variant and checked against your master profile: any with a number or link your profile
          does not have is dropped. LinkedIn has no API for profile edits, so copy what you like into LinkedIn yourself.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={suggest} disabled={pending}>
          Suggest a headline and About
        </Button>
        {result ? (
          <div className="space-y-3" data-testid="linkedin-suggestions">
            {result.headlines.map((h) => (
              <div key={h} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2">
                <p className="min-w-0 flex-1">{h}</p>
                <CopyButton text={h} />
              </div>
            ))}
            {result.about ? (
              <div className="space-y-2 rounded-md border p-2">
                <p className="whitespace-pre-line">{result.about}</p>
                <CopyButton text={result.about} label="Copy About" />
              </div>
            ) : null}
            {result.dropped > 0 ? <p className="text-xs text-muted-foreground">{result.dropped} suggestion(s) dropped by the fact lock.</p> : null}
            {result.headlines.length === 0 && !result.about ? <p className="text-xs text-muted-foreground">No suggestion passed the fact lock this time.</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
