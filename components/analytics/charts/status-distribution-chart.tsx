'use client'
import { Cell, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

export interface StatusDistributionDatum {
  status: string
  count: number
  label: string
  fill: string
}

interface StatusDistributionChartProps {
  config: ChartConfig
  data: StatusDistributionDatum[]
}

/**
 * Donut of the pipeline by status. The legend is drawn as HTML below the plot
 * (ChartContainer `legend`), so the ring is sized to the space that is left
 * and the two never overlap, however many rows the legend wraps to.
 */
export function StatusDistributionChart({ config, data }: StatusDistributionChartProps) {
  const legend = (
    <ChartLegendContent
      className="pt-2"
      payload={data.map((d) => ({ value: d.status, color: d.fill, dataKey: d.status }))}
    />
  )
  return (
    <ChartContainer config={config} className="h-full w-full" legend={legend}>
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          innerRadius="55%"
          outerRadius="90%"
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.status} fill={entry.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
