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
import { joinMeta } from '@/lib/ui/meta'
import { Checkbox } from '@/components/ui/checkbox'

export const dynamic = 'force-dynamic'

const MAX_JOBS = 3
const PICKER_SIZE = 15

interface PickerOption {
  key: string
  label: string
  meta: string
}

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

function PickerGroup({ title, options, selected }: { title: string; options: PickerOption[]; selected: readonly string[] }) {
  if (options.length === 0) return null
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{title}</legend>
      <ul className="divide-y rounded-lg border">
        {options.map((o) => (
          <li key={o.key}>
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-accent">
              <Checkbox name="ids" value={o.key} defaultChecked={selected.includes(o.key)} className="mt-1" />
              <span className="min-w-0">
                <span className="block font-medium">{o.label}</span>
                {o.meta ? <span className="block truncate text-xs text-muted-foreground">{o.meta}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

/** Side by side: up to three jobs and the current job, sorted by weighted total. */
export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const userId = await requireUserId()
  const sp = await searchParams
  const keys = parseOpportunityKeys(sp.ids, MAX_JOBS)
  const [data, options] = await Promise.all([compareKeys(userId, keys), pickerOptions(userId)])
  const hasCurrent = data.settings.current !== null
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
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link href="/settings/profile/current-job">Current job &amp; assumptions</Link>
          </Button>
        }
      />

      {!hasCurrent ? (
        <EmptyState
          icon={Scale}
          title="Add your current job first"
          description="The comparison needs a baseline: your pay, benefits and how your job feels now. It stays private."
          action={
            <Button asChild size="sm">
              <Link href="/settings/profile/current-job">Add current job</Link>
            </Button>
          }
        />
      ) : data.comparisons.length === 0 ? null : (
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
            <form method="get" action="/compare" className="space-y-4">
              <p className="text-xs text-muted-foreground">Pick up to {MAX_JOBS}; extra picks are ignored.</p>
              <PickerGroup title="In this comparison" options={inComparison} selected={keys} />
              <div className="grid gap-4 lg:grid-cols-2">
                <PickerGroup title="Applications" options={options.applications} selected={keys} />
                <PickerGroup title="Discoveries" options={options.discoveries} selected={keys} />
              </div>
              <Button type="submit" size="sm">
                Compare
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
