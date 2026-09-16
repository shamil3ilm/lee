import Link from 'next/link'
import { requireUserId } from '@/lib/auth/require-session'
import * as discoveriesQ from '@/lib/db/queries/discoveries'
import * as companyDiscoveriesQ from '@/lib/db/queries/companyDiscoveries'
import * as sourcesQ from '@/lib/db/queries/sources'
import { PageHeader } from '@/components/page-header'
import { DiscoveryInbox } from '@/components/discovery-inbox'
import {
  DiscoveryFilters,
  type DiscoverySort,
  type DiscoveryStatusFilter,
} from '@/components/discovery-filters'
import type {
  DiscoveryRowJob,
  DiscoveryRowCompany,
  DiscoveryReasoning,
} from '@/components/discovery-row'
import type {
  NormalizedJob,
  NormalizedCompany,
} from '@/lib/discovery/adapters/types'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface DiscoveriesPageProps {
  searchParams: Promise<{
    tab?: string
    status?: string
    minScore?: string
    sort?: string
  }>
}

function parseTab(raw: string | undefined): 'jobs' | 'companies' {
  return raw === 'companies' ? 'companies' : 'jobs'
}

function parseStatus(raw: string | undefined): DiscoveryStatusFilter {
  if (raw === 'saved' || raw === 'dismissed') return raw
  return 'new'
}

function parseSort(raw: string | undefined): DiscoverySort {
  if (raw === 'match' || raw === 'benefits' || raw === 'posted') return raw
  return 'combined'
}

function parseMinScore(raw: string | undefined): number {
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, n))
}

export default async function DiscoveriesPage({
  searchParams,
}: DiscoveriesPageProps): Promise<React.ReactElement> {
  const userId = await requireUserId()
  const sp = await searchParams
  const tab = parseTab(sp.tab)
  const status = parseStatus(sp.status)
  const minScore = parseMinScore(sp.minScore)
  const sort = parseSort(sp.sort)

  const sources = await sourcesQ.list(userId)
  const sourceNameById = new Map(sources.map((s) => [s.id, s.name] as const))

  const jobItems: DiscoveryRowJob[] =
    tab === 'jobs'
      ? (await discoveriesQ.list(userId, {
          status,
          minScore: minScore > 0 ? minScore : undefined,
          sort,
        })).map((d) => ({
          id: d.id,
          status: d.status,
          matchScore: d.matchScore,
          benefitsScore: d.benefitsScore,
          createdAt: d.createdAt.toISOString(),
          sourceName: sourceNameById.get(d.sourceId) ?? 'unknown',
          normalized: d.normalized as unknown as NormalizedJob,
          reasoning: (d.matchReasoning as DiscoveryReasoning | null) ?? null,
        }))
      : []

  const companyItems: DiscoveryRowCompany[] =
    tab === 'companies'
      ? (await companyDiscoveriesQ.list(userId, {
          status,
          minScore: minScore > 0 ? minScore : undefined,
        })).map((d) => ({
          id: d.id,
          status: d.status,
          matchScore: d.matchScore,
          createdAt: d.createdAt.toISOString(),
          sourceName: sourceNameById.get(d.sourceId) ?? 'unknown',
          normalized: d.normalized as unknown as NormalizedCompany,
          reasoning: (d.matchReasoning as DiscoveryReasoning | null) ?? null,
        }))
      : []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Discovery"
        description="AI-scored jobs and companies from your sources."
      />
      <TabBar tab={tab} />
      <DiscoveryFilters tab={tab} status={status} minScore={minScore} sort={sort} />
      {tab === 'jobs' ? (
        <DiscoveryInbox kind="jobs" items={jobItems} />
      ) : (
        <DiscoveryInbox kind="companies" items={companyItems} />
      )}
    </div>
  )
}

function TabBar({ tab }: { tab: 'jobs' | 'companies' }): React.ReactElement {
  const tabs: Array<{ id: 'jobs' | 'companies'; label: string }> = [
    { id: 'jobs', label: 'Jobs' },
    { id: 'companies', label: 'Companies' },
  ]
  return (
    <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={`/discoveries?tab=${t.id}`}
          className={cn(
            'inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-all',
            tab === t.id
              ? 'bg-background text-foreground shadow'
              : 'hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
