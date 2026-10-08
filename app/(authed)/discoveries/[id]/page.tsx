import { notFound } from 'next/navigation'
import { ExternalLink, MapPin } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as discoveriesQ from '@/lib/db/queries/discoveries'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import { loadComparisonCard } from '@/lib/compare/card-data'
import { opportunityKey } from '@/lib/compare/inputs'
import { logger } from '@/lib/logger'
import { workModeLabel, humanizeLabel } from '@/lib/ui/labels'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { PageHeader } from '@/components/page-header'
import { MarkdownText } from '@/components/markdown-text'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ComparisonCard } from '@/components/compare/comparison-card'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One discovered posting: its details and the comparison with the current job. */
export default async function DiscoveryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const userId = await requireUserId()
  const row = await discoveriesQ.getById(userId, id)
  const job = row?.normalized as Partial<NormalizedJob> | undefined
  if (!row || !job || (job.kind && job.kind !== 'job')) notFound()
  const card = await loadComparisonCard(userId, opportunityKey('discovery', row.id)).catch((err: unknown) => {
    logger.warn('compare_card_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return { comparison: null, hasCurrent: false, saved: null, citations: {} }
  })
  const title = repairMojibake(job.title ?? 'Untitled')
  const company = job.companyName ? repairMojibake(job.companyName) : null

  return (
    <div className="space-y-6">
      <Breadcrumbs
        className="mb-3"
        items={[{ label: 'Find' }, { label: 'Discovery', href: '/discoveries' }, { label: company ? `${company} — ${title}` : title }]}
      />
      <PageHeader title={title} description={company ?? undefined} />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 text-sm">
          <Badge variant="outline">{humanizeLabel(row.status)}</Badge>
          {job.location ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden="true" />
              {repairMojibake(job.location)}
            </span>
          ) : null}
          {workModeLabel(job.remoteType) ? <Badge variant="outline">{workModeLabel(job.remoteType)}</Badge> : null}
          {row.matchScore !== null ? <Badge variant="info">{row.matchScore}% AI match</Badge> : null}
          {job.applyUrl ? (
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Source <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <ComparisonCard comparison={card.comparison} hasCurrent={card.hasCurrent} saved={card.saved} citations={card.citations} />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Job description</CardTitle>
            </CardHeader>
            <CardContent>
              {(row.pastedJd ?? job.descriptionMd) ? (
                <MarkdownText source={row.pastedJd ?? job.descriptionMd ?? ""} />
              ) : (
                <p className="text-sm text-muted-foreground">No description was captured for this posting.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
