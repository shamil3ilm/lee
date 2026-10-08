import Link from 'next/link'
import { Columns3, Scale } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as appsQ from '@/lib/db/queries/applications'
import * as discoveriesQ from '@/lib/db/queries/discoveries'
import { compareKeys } from '@/lib/compare/service'
import { opportunityKey, parseOpportunityKeys } from '@/lib/compare/inputs'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CompareTable } from '@/components/compare/compare-table'
import { ComparePicker, type PickerOption } from '@/components/compare/compare-picker'
import { Pencil } from 'lucide-react'
import { joinMeta } from '@/lib/ui/meta'

export const dynamic = 'force-dynamic'

const MAX_JOBS = 3
const PICKER_SIZE = 15
// Settings › Current job (moved out of Settings › Profile; the old URL redirects).
const CURRENT_JOB_HREF = '/settings/current-job'

async function pickerOptions(userId: string): Promise<{ applications: PickerOption[]; discoveries: PickerOption[] }> {
  const [apps, found] = await Promise.all([
    appsQ.list(userId),
    discoveriesQ.list(userId, { statuses: ['shortlisted', 'new', 'saved'], sort: 'combined', limit: PICKER_SIZE, quarantine: 'exclude' }),
  ])
  return {
    applications: apps.slice(0, PICKER_SIZE).map((a) => ({
      key: opportunityKey('application', a.id),
      label: a.job.title,
      meta: joinMeta([a.job.company?.name, a.job.location]),
    })),
    discoveries: found.map((d) => ({
      key: opportunityKey('discovery', d.id),
      label: repairMojibake(d.title ?? 'Untitled'),
      meta: joinMeta([d.companyName ? repairMojibake(d.companyName) : null, d.location]),
    })),
  }
}

/** Side by side: up to three jobs and the current job, sorted by weighted total. */
export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const userId = await requireUserId()
  const sp = await searchParams
  const keys = parseOpportunityKeys(sp.ids, MAX_JOBS)
  const [data, options] = await Promise.all([compareKeys(userId, keys), pickerOptions(userId)])
  const current = data.settings.current
  const hasCurrent = current !== null
  // Keep the compared jobs pickable even when they are not in the lists below (e.g. dismissed).
  const listed = new Set([...options.applications, ...options.discoveries].map((o) => o.key))
  const inComparison: PickerOption[] = data.comparisons
    .filter((c) => !listed.has(c.key))
    .map((c) => ({ key: c.key, label: c.title, meta: c.companyName ?? '' }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compare"
        description={`Up to ${MAX_JOBS} jobs next to your current one, sorted by a weighted total of the criteria you care about.`}
      />

      {current ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
          data-testid="compare-baseline"
        >
          <span className="text-muted-foreground">Baseline</span>
          <span className="min-w-0 font-medium">
            Current job: {joinMeta([current.title || 'Untitled', current.employer], ', ') || 'Saved'}
          </span>
          <Link
            href={CURRENT_JOB_HREF}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            <Pencil className="size-3" aria-hidden="true" />
            Edit current job &amp; assumptions
          </Link>
        </div>
      ) : null}

      {!hasCurrent ? (
        <EmptyState
          icon={Scale}
          title="Add your current job first"
          description="The comparison needs a baseline: your pay, benefits and how your job feels now. It stays private."
          action={
            <Button asChild size="sm">
              <Link href={CURRENT_JOB_HREF}>Add current job</Link>
            </Button>
          }
        />
      ) : data.comparisons.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="Pick jobs to put next to your current one"
          description={`Tick up to ${MAX_JOBS} applications or discoveries below, then press Compare. Each gets a weighted total from pay, benefits, growth and the rest, with your current job as the baseline row.`}
        />
      ) : (
        <CompareTable
          current={data.current?.scores ?? null}
          initialWeights={data.comparisons[0]!.weights}
          items={data.comparisons.map((c) => ({
            key: c.key,
            title: c.title,
            companyName: c.companyName,
            href: c.href,
            verdict: c.verdict,
            scores: c.job.scores,
          }))}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Columns3 className="size-4" aria-hidden="true" />
            Choose jobs to compare
          </CardTitle>
        </CardHeader>
        <CardContent>
          {options.applications.length + options.discoveries.length + inComparison.length === 0 ? (
            <EmptyState size="sm" title="Nothing to compare yet" description="Save an application or let discovery find some postings." />
          ) : (
            <ComparePicker
              max={MAX_JOBS}
              selected={keys}
              groups={[
                { title: 'In this comparison', options: inComparison, wide: true },
                { title: 'Applications', options: options.applications },
                { title: 'Discoveries', options: options.discoveries },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
