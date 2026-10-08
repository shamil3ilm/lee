import { plural } from '@/lib/ui/labels'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as briefsQ from '@/lib/db/queries/radarBriefs'
import { primaryCandidates } from '@/lib/radar/brief/primary'
import { computeTimeline } from '@/lib/radar/brief/timeline'
import type { BriefModule, BriefSections, BriefSource } from '@/lib/radar/brief/types'
import { RADAR_KIND_LABELS, type RadarMetrics } from '@/lib/radar/types'
import { loadEntry } from '@/lib/radar/view'
import { shortDay } from '@/lib/ui/date'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BriefPanel } from '@/components/radar/brief-panel'
import { EntryActions } from '@/components/radar/entry-actions'
import { FirstSeenList } from '@/components/radar/first-seen'
import { Highlighted } from '@/components/radar/highlighted'
import { TimelineList } from '@/components/radar/timeline-list'

export const dynamic = 'force-dynamic'
// The brief draft fetches up to four sources and calls the model.
export const maxDuration = 60

export default async function RadarEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await requireUserId()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const loaded = await loadEntry(userId, id)
  if (!loaded) notFound()
  const { entry, raw } = loaded
  const brief = await briefsQ.getByEntry(userId, id)
  const metricsOf = (m: unknown): RadarMetrics => m as RadarMetrics
  const timeline = computeTimeline(raw.map((i) => ({ ...i, metrics: metricsOf(i.metrics) })))
  const primaryCount = primaryCandidates(raw.map((i) => ({ ...i, metrics: metricsOf(i.metrics) }))).length

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumbs items={[{ label: 'Radar', href: '/radar' }, { label: entry.name }]} />
      <PageHeader title={entry.name} description={`${RADAR_KIND_LABELS[entry.kind]} · ${plural(entry.itemCount, 'item')} from ${plural(entry.firstSeen.length, 'source')}`} />
      {entry.terms.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Matching watch terms">
          {entry.terms.map((t) => (
            <Badge key={t.id} variant="warning">
              {t.label}
            </Badge>
          ))}
        </div>
      ) : null}
      <EntryActions entryId={entry.id} name={entry.name} read={entry.read} saved={entry.saved} terms={entry.terms} />
      <FirstSeenList firstSeen={entry.firstSeen} />

      <BriefPanel
        entryId={entry.id}
        primarySources={primaryCount}
        saved={
          brief
            ? {
                sections: brief.sections as BriefSections,
                sources: brief.sources as BriefSource[],
                module: brief.module as BriefModule | null,
                savedAt: brief.updatedAt.toISOString().slice(0, 10),
              }
            : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineList events={timeline} />
          <p className="mt-2 text-xs text-muted-foreground">From the sources&apos; own dates (creation, submission, announcement, first seen) — never from AI output.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {entry.items.map((i) => (
              <li key={i.id} className="space-y-1 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{i.sourceLabel}</span>
                  <span>{shortDay(i.day)}</span>
                </div>
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="block break-words text-sm hover:underline">
                  <Highlighted segments={i.title} />
                  <ExternalLink className="ml-1 inline size-3 text-muted-foreground" aria-hidden />
                </a>
                {i.excerpt.length > 0 ? (
                  <p className="break-words text-xs text-muted-foreground">
                    <Highlighted segments={i.excerpt} />
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
