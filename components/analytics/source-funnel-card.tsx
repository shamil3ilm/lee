'use client'
import dynamic from 'next/dynamic'
import { BarChart3 } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import { ChartSkeleton } from './charts/chart-skeleton'
import type { SourceFunnelRow } from '@/lib/analytics/service'

interface SourceFunnelCardProps {
  data: SourceFunnelRow[]
}

// recharts loads lazily so it stays out of the /analytics first-load bundle.
const SourceFunnelChart = dynamic(
  () => import('./charts/source-funnel-chart').then((m) => m.SourceFunnelChart),
  { ssr: false, loading: ChartSkeleton },
)

/**
 * Grouped bar chart: one group per source, four bars per group representing
 * the funnel stages. Cross-source comparison is the point — the same colour
 * for the same stage across sources makes conversion drops immediately
 * visible.
 */
export function SourceFunnelCard({ data }: SourceFunnelCardProps) {
  const isEmpty = data.length === 0

  return (
    <AnalyticsCardShell
      title="Source funnel"
      description="For each application source, how many reached each pipeline stage. Bars are inclusive: Screened counts every application that reached Screen OR later."
      exportMetric="source-funnel"
      isEmpty={isEmpty}
      emptyMessage="Track a few applications with a source set to see conversion by channel."
      emptyIcon={BarChart3}
    >
      <SourceFunnelChart data={data} />
    </AnalyticsCardShell>
  )
}
