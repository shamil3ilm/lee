'use client'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { CATEGORY_Y_AXIS, CHART_MARGIN, VALUE_X_AXIS } from '@/components/ui/chart-defaults'

export interface StatusDistributionDatum {
  status: string
  count: number
  label: string
  fill: string
}

interface StatusDistributionChartProps {
  config: ChartConfig
  /** Already in pipeline order (Saved → Withdrawn). */
  data: StatusDistributionDatum[]
}

/**
 * Horizontal bars of the pipeline by status, in pipeline order, each bar in
 * its stage tone with its count at the end. Replaces a 7-slice donut, whose
 * slices were hard to compare and needed a legend to decode.
 */
export function StatusDistributionChart({ config, data }: StatusDistributionChartProps) {
  return (
    <ChartContainer config={config} className="h-full w-full">
      <BarChart data={data} layout="vertical" margin={{ ...CHART_MARGIN, right: 28 }}>
        <CartesianGrid horizontal={false} />
        <XAxis {...VALUE_X_AXIS} allowDecimals={false} />
        <YAxis dataKey="label" {...CATEGORY_Y_AXIS} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" radius={[0, 2, 2, 0]}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={entry.fill} />
          ))}
          <LabelList dataKey="count" position="right" fontSize={11} className="fill-foreground tabular-nums" />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
