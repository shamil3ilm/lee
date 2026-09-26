'use client'
import dynamic from 'next/dynamic'
import { Store } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import { ChartSkeleton } from './charts/chart-skeleton'
import type { VendorRow } from '@/lib/analytics/service'

interface TopVendorsCardProps {
  data: VendorRow[]
}

const TopVendorsChart = dynamic(
  () => import('./charts/top-vendors-chart').then((m) => m.TopVendorsChart),
  { ssr: false, loading: ChartSkeleton },
)

/**
 * Horizontal bar chart of the top 10 vendors by spend over the last 3
 * months. Vendor names are compared case-insensitively upstream so casing
 * variants collapse.
 */
export function TopVendorsCard({ data }: TopVendorsCardProps) {
  const isEmpty = data.length === 0
  const chartData = data.map((r) => ({
    vendor: r.vendor,
    totalCents: r.totalCents,
  }))

  return (
    <AnalyticsCardShell
      title="Top vendors"
      description="Top 10 vendors by total spend over the last 3 months. Casing variants (e.g. Netflix vs netflix) are merged."
      exportMetric="top-vendors"
      isEmpty={isEmpty}
      emptyMessage="Add a vendor to your expenses to see who you spend with most."
      emptyIcon={Store}
    >
      <TopVendorsChart data={chartData} />
    </AnalyticsCardShell>
  )
}
