'use client'
import { Activity } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import type { WeeklyBar } from '@/lib/analytics/service'

interface WeeklyActivityCardProps {
  data: WeeklyBar[]
}

const CONFIG: ChartConfig = {
  count: { label: 'Applications', color: 'hsl(217 91% 60%)' },
}

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
      <ChartContainer config={CONFIG} className="h-full w-full">
        <BarChart data={enriched} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            interval="preserveStartEnd"
          />
          <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" fill="var(--color-count)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </AnalyticsCardShell>
  )
}
