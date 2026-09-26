'use client'
import dynamic from 'next/dynamic'
import { TrendingUp } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import { ChartSkeleton } from './charts/chart-skeleton'
import type { MonthComparisonRow } from '@/lib/analytics/service'

interface MonthOverMonthCardProps {
  data: MonthComparisonRow[]
}

const MonthOverMonthChart = dynamic(
  () => import('./charts/month-over-month-chart').then((m) => m.MonthOverMonthChart),
  { ssr: false, loading: ChartSkeleton },
)

/**
 * Grouped bar chart comparing per-category spend against the previous month.
 * Top 6 categories by absolute delta so the chart stays legible even when
 * the user has 20+ categories. Delta % is rendered as a label above the
 * current-month bar.
 */
export function MonthOverMonthCard({ data }: MonthOverMonthCardProps) {
  const isEmpty =
    data.length === 0 ||
    data.every((r) => r.currentCents === 0 && r.previousCents === 0)

  const top = data.slice(0, 6).map((r) => ({
    category: r.category,
    current: r.currentCents,
    previous: r.previousCents,
    deltaLabel:
      r.deltaPercent === null
        ? '—'
        : `${r.deltaPercent > 0 ? '+' : ''}${r.deltaPercent.toFixed(0)}%`,
  }))

  return (
    <AnalyticsCardShell
      title="Month-over-month"
      description="Per-category spend against the previous month. Delta % is labelled above the current-month bar. Top 6 categories by absolute change."
      exportMetric="month-over-month"
      isEmpty={isEmpty}
      emptyMessage="Log expenses across two months to see how spending changes."
      emptyIcon={TrendingUp}
    >
      <MonthOverMonthChart data={top} />
    </AnalyticsCardShell>
  )
}
