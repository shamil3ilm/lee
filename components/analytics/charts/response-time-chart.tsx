'use client'
import { CHART_PRIMARY } from '@/lib/ui/chart-palette'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { CATEGORY_AXIS, CHART_MARGIN, VALUE_AXIS } from '@/components/ui/chart-defaults'
import type { ResponseTimeBucket } from '@/lib/analytics/service'

const CONFIG: ChartConfig = {
  count: { label: 'Applications', color: CHART_PRIMARY },
}

export function ResponseTimeChart({ data }: { data: ResponseTimeBucket[] }) {
  return (
    <ChartContainer config={CONFIG} className="h-full w-full">
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucketDays" {...CATEGORY_AXIS} />
        <YAxis {...VALUE_AXIS} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
