'use client'
import dynamic from 'next/dynamic'
import { Activity } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import { ChartSkeleton } from './charts/chart-skeleton'
import type { WeeklyBar } from '@/lib/analytics/service'

interface WeeklyActivityCardProps {
  data: WeeklyBar[]
}

const WeeklyActivityChart = dynamic(
  () => import('./charts/weekly-activity-chart').then((m) => m.WeeklyActivityChart),
  { ssr: false, loading: ChartSkeleton },
)

function shortWeekLabel(iso: string): string {
  // Show `Sep 21` rather than `2026-09-21` on the X axis — the year rarely
  // helps when the window is a rolling 12 weeks.
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * Bar chart of applications created per ISO week over the recent window.
 * Every week in the window is present (zero bars for quiet weeks) so the
 * axis stays continuous and dips are visible.
 */
export function WeeklyActivityCard({ data }: WeeklyActivityCardProps) {
  const total = data.reduce((s, b) => s + b.count, 0)
  const isEmpty = total === 0
  const enriched = data.map((b) => ({ ...b, label: shortWeekLabel(b.weekStart) }))

  return (
    <AnalyticsCardShell
      title="Weekly activity"
      description="Applications created per ISO week (Monday-based) over the last 12 weeks. Includes weeks with zero activity so gaps are visible."
      exportMetric="weekly-activity"
      isEmpty={isEmpty}
      emptyMessage="Create applications over a few weeks to see your cadence emerge."
      emptyIcon={Activity}
    >
      <WeeklyActivityChart data={enriched} />
    </AnalyticsCardShell>
  )
}
