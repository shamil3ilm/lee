'use client'
import dynamic from 'next/dynamic'
import { BarChart3 } from 'lucide-react'
import type { ChartConfig } from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import { ChartSkeleton } from './charts/chart-skeleton'
import type { StatusSlice } from '@/lib/analytics/service'
import { APPLICATION_STATUSES, STATUS_LABELS, STATUS_TONE, type ApplicationStatus } from '@/lib/ui/status'
import { orderByDomain } from '@/components/ui/chart-defaults'
import { toneColor } from '@/lib/ui/tones'

interface StatusDistributionCardProps {
  data: StatusSlice[]
}

// Status slices use the pipeline stage tones, so a status is the same
// colour here, on badges, kanban columns and the funnel.
function colorFor(status: string): string {
  const tone = STATUS_TONE[status as ApplicationStatus]
  return tone ? toneColor(tone) : toneColor('neutral')
}

const StatusDistributionChart = dynamic(
  () => import('./charts/status-distribution-chart').then((m) => m.StatusDistributionChart),
  { ssr: false, loading: ChartSkeleton },
)

function labelFor(status: string): string {
  return STATUS_LABELS[status as ApplicationStatus] ?? status
}

/**
 * Horizontal bars of the current pipeline, one per non-empty status, in
 * pipeline order (Saved → Withdrawn) with the count at the end of each bar.
 */
export function StatusDistributionCard({ data }: StatusDistributionCardProps) {
  const isEmpty = data.length === 0 || data.every((s) => s.count === 0)

  const config: ChartConfig = { count: { label: 'Applications' } }
  for (const s of data) {
    config[s.status] = {
      label: labelFor(s.status),
      color: colorFor(s.status),
    }
  }

  const byStatus = new Map(data.map((s) => [s.status, s] as const))
  const ordered = orderByDomain(
    data.filter((s) => s.count > 0).map((s) => s.status),
    APPLICATION_STATUSES,
  ).map((status) => byStatus.get(status)!)

  const enriched = ordered.map((s) => ({
    status: s.status,
    count: s.count,
    label: labelFor(s.status),
    fill: colorFor(s.status),
  }))

  return (
    <AnalyticsCardShell
      title="Status distribution"
      description="Applications at each status right now, in pipeline order."
      exportMetric="status-distribution"
      isEmpty={isEmpty}
      emptyMessage="Add applications to see how your pipeline breaks down by status."
      emptyIcon={BarChart3}
    >
      <StatusDistributionChart config={config} data={enriched} />
    </AnalyticsCardShell>
  )
}
