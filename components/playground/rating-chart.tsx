'use client'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { CHART_MARGIN, TIME_AXIS, VALUE_AXIS } from '@/components/ui/chart-defaults'
import { CHART_PRIMARY } from '@/lib/ui/chart-palette'

const CONFIG: ChartConfig = {
  rating: { label: 'Rating', color: CHART_PRIMARY },
}

export interface RatingPoint {
  label: string
  rating: number
}

/** Rating over time for one skill (level bands are every 200 points from 1200). */
export function RatingChart({ data }: { data: RatingPoint[] }) {
  return (
    <ChartContainer config={CONFIG} className="h-full w-full">
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...TIME_AXIS} />
        <YAxis {...VALUE_AXIS} domain={['dataMin - 50', 'dataMax + 50']} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="rating" stroke="var(--color-rating)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  )
}
