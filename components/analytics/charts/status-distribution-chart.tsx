'use client'
import { Cell, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
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

export function StatusDistributionChart({ config, data }: StatusDistributionChartProps) {
  return (
    <ChartContainer config={config} className="h-full w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          innerRadius={40}
          outerRadius={72}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.status} fill={entry.fill} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent />} />
      </PieChart>
    </ChartContainer>
  )
}
