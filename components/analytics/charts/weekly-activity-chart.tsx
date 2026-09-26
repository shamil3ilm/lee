'use client'
import { CHART_PRIMARY } from '@/lib/ui/chart-palette'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { WeeklyBar } from '@/lib/analytics/service'

const CONFIG: ChartConfig = {
  count: { label: 'Applications', color: CHART_PRIMARY },
}

export type WeeklyActivityDatum = WeeklyBar & { label: string }

export function WeeklyActivityChart({ data }: { data: WeeklyActivityDatum[] }) {
  return (
    <ChartContainer config={CONFIG} className="h-full w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
  )
}
