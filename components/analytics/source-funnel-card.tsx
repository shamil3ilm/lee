'use client'
import { BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import type { SourceFunnelRow } from '@/lib/analytics/service'

interface SourceFunnelCardProps {
  data: SourceFunnelRow[]
}

const CONFIG: ChartConfig = {
  applied: { label: 'Applied', color: 'hsl(217 91% 60%)' },
  screened: { label: 'Screened', color: 'hsl(239 84% 67%)' },
  interviewed: { label: 'Interviewed', color: 'hsl(258 90% 66%)' },
  offered: { label: 'Offered', color: 'hsl(142 71% 45%)' },
}

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
      <ChartContainer config={CONFIG} className="h-full w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="source" tickLine={false} axisLine={false} tickMargin={6} />
          <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="applied" fill="var(--color-applied)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="screened" fill="var(--color-screened)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="interviewed" fill="var(--color-interviewed)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="offered" fill="var(--color-offered)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </AnalyticsCardShell>
  )
}
