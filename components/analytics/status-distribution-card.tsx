'use client'
import dynamic from 'next/dynamic'
import { PieChart as PieChartIcon } from 'lucide-react'
import type { ChartConfig } from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import { ChartSkeleton } from './charts/chart-skeleton'
import type { StatusSlice } from '@/lib/analytics/service'
import { STATUS_LABELS, STATUS_TONE, type ApplicationStatus } from '@/lib/ui/status'
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
 * Donut chart of the current pipeline breakdown — one slice per non-empty
 * status. Chart config is built lazily from the incoming slices so the
 * legend labels & colours track the data exactly.
 */
export function StatusDistributionCard({ data }: StatusDistributionCardProps) {
  const isEmpty = data.length === 0 || data.every((s) => s.count === 0)

  const config: ChartConfig = {}
  for (const s of data) {
    config[s.status] = {
      label: labelFor(s.status),
      color: colorFor(s.status),
    }
  }

  const enriched = data.map((s) => ({
    status: s.status,
    count: s.count,
    label: labelFor(s.status),
    fill: colorFor(s.status),
  }))

  return (
    <AnalyticsCardShell
      title="Status distribution"
      description="Current pipeline breakdown — one slice per application status, sized by count."
      exportMetric="status-distribution"
      isEmpty={isEmpty}
      emptyMessage="Add applications to see how your pipeline breaks down by status."
      emptyIcon={PieChartIcon}
    >
      <StatusDistributionChart config={config} data={enriched} />
    </AnalyticsCardShell>
  )
}
