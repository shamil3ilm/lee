'use client'
import { PieChart as PieChartIcon } from 'lucide-react'
import { Cell, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import type { StatusSlice } from '@/lib/analytics/service'
import { STATUS_LABELS, type ApplicationStatus } from '@/lib/ui/status'

interface StatusDistributionCardProps {
  data: StatusSlice[]
}

// Match the palette used by the FunnelWidget so the same status looks the
// same across the app; unknown statuses fall through to a neutral colour.
const STATUS_COLOR: Record<string, string> = {
  saved: 'hsl(215 20% 65%)',
  applied: 'hsl(217 91% 60%)',
  screen: 'hsl(239 84% 67%)',
  interview: 'hsl(258 90% 66%)',
  offer: 'hsl(142 71% 45%)',
  rejected: 'hsl(0 84% 60%)',
  withdrawn: 'hsl(215 14% 45%)',
}

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
      color: STATUS_COLOR[s.status] ?? 'hsl(215 14% 45%)',
    }
  }

  const enriched = data.map((s) => ({
    status: s.status,
    count: s.count,
    label: labelFor(s.status),
    fill: STATUS_COLOR[s.status] ?? 'hsl(215 14% 45%)',
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
      <ChartContainer config={config} className="h-full w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={enriched}
            dataKey="count"
            nameKey="status"
            innerRadius={40}
            outerRadius={72}
            paddingAngle={2}
          >
            {enriched.map((entry) => (
              <Cell key={entry.status} fill={entry.fill} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent />} />
        </PieChart>
      </ChartContainer>
    </AnalyticsCardShell>
  )
}
