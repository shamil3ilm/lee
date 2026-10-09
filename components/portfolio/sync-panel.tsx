'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { clearOrphansAction } from '@/app/(authed)/settings/publish/sync-actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SectionDiff } from '@/lib/portfolio/diff'
import type { OrphanOverlay } from '@/lib/portfolio/overlay'
import { SyncLine, type SyncLineProps } from './sync-line'

interface SyncPanelProps extends SyncLineProps {
  lastDiff: SectionDiff[]
  orphans: OrphanOverlay[]
  /** A sync has happened at least once. */
  synced: boolean
}

const KIND_LABELS: Readonly<Record<OrphanOverlay['kind'], string>> = {
  work: 'Job',
  project: 'Project',
  highlight: 'Highlight',
  skill: 'Skill',
}

function show(v: unknown): string {
  if (v === undefined) return '—'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 160 ? `${s.slice(0, 157)}…` : s
}

function overlaySummary(o: OrphanOverlay): string {
  const parts: string[] = []
  const v = o.overlay
  if (typeof v.depth === 'string' && v.depth !== 'own') parts.push(v.depth === 'ai_assisted' ? 'AI-assisted' : 'learning')
  if (v.interviewReady === true) parts.push('interview-ready')
  else if (v.domainReady === true) parts.push('domain-ready')
  if (Array.isArray(v.alternates) && v.alternates.length > 0) parts.push(`${v.alternates.length} wording(s)`)
  if (Array.isArray(v.keywords) && v.keywords.length > 0) parts.push(`stack: ${(v.keywords as string[]).join(', ')}`)
  if (v.kind === 'domain') parts.push('domain skill')
  if (typeof v.studyNotes === 'string') parts.push('study notes')
  return parts.join(' · ')
}

/** What the last sync changed: read-only, a diagnostic. */
function LastDiff({ diff }: { diff: SectionDiff[] }) {
  if (diff.length === 0) return <p className="text-sm text-muted-foreground">The last sync changed nothing in lee.</p>
  return (
    <details>
      <summary className="cursor-pointer text-sm text-primary">What changed in the last sync ({diff.map((d) => d.label).join(', ')})</summary>
      <div className="mt-2 space-y-3" aria-label="What changed in the last sync" role="region">
        {diff.map((d) => (
          <section key={d.section} className="space-y-1 rounded-md border p-2">
            <h3 className="text-sm font-medium">{d.label}</h3>
            <ul className="space-y-1 text-xs">
              {d.changes.map((c) => (
                <li key={c.path} className="grid gap-0.5 sm:grid-cols-[minmax(0,10rem)_1fr_1fr] sm:gap-2">
                  <code className="break-all text-muted-foreground">{c.path}</code>
                  <span className="break-words">
                    <span className="text-muted-foreground">portfolio:</span> {show(c.repo)}
                  </span>
                  <span className="break-words">
                    <span className="text-muted-foreground">lee before:</span> {show(c.lee)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}

function Orphans({ orphans }: { orphans: OrphanOverlay[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const clear = (id?: string): void =>
    start(async () => {
      const r = await clearOrphansAction(id)
      if ('error' in r) toast.error(r.error)
      else toast.success(id ? 'Removed from the list' : 'List cleared')
      router.refresh()
    })
  if (orphans.length === 0) return null
  return (
    <section aria-labelledby="orphans-title" className="space-y-2 rounded-md border border-warning/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="orphans-title" className="text-sm font-medium">
          Removed from your portfolio ({orphans.length})
        </h3>
        <Button type="button" size="sm" variant="outline" onClick={() => clear()} disabled={pending}>
          Clear all
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        These items left your portfolio but carried lee-only notes (readiness, wordings, stack). Kept here so nothing is lost silently; clear them when you no longer need them.
      </p>
      <ul className="divide-y text-sm" data-testid="portfolio-orphans">
        {orphans.map((o) => (
          <li key={o.id} className="flex items-start gap-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="break-words">
                <span className="text-muted-foreground">{KIND_LABELS[o.kind]}:</span> {o.label}
                {o.parent ? <span className="text-muted-foreground"> ({o.parent})</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">{overlaySummary(o)}</p>
            </div>
            <Button type="button" size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" onClick={() => clear(o.id)} disabled={pending} aria-label={`Clear ${o.label}`}>
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Settings › Portfolio: the portfolio is the source; lee pulls it. */
export function SyncPanel({ lastDiff, orphans, synced, ...line }: SyncPanelProps) {
  return (
    <Card id="portfolio-sync">
      <CardHeader>
        <CardTitle>Sync from portfolio</CardTitle>
        <CardDescription>
          Your portfolio’s profile.json is the source of your public profile. lee reads it when you open Profile, Résumé or this page (at most every 10 minutes), once a day, and when you press Sync now. Readiness flags, wordings and private items stay in lee.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SyncLine {...line} />
        {synced ? <LastDiff diff={lastDiff} /> : null}
        <Orphans orphans={orphans} />
      </CardContent>
    </Card>
  )
}
