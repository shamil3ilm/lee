'use client'
import { CHART_PRIMARY } from '@/lib/ui/chart-palette'
import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { CalibrationOutcome } from '@/lib/analytics/service'

const OUTCOME_LABEL: Record<number, string> = {
  0: 'Rejected / Dismissed',
  1: 'Saved',
  2: 'Applied',
  3: 'Interviewed',
  4: 'Offered',
}

const CONFIG: ChartConfig = {
  calibration: { label: 'Discoveries', color: CHART_PRIMARY },
}

export interface CalibrationDatum {
  x: number
  y: number
  z: number
  outcome: CalibrationOutcome
}

export function DiscoveryCalibrationChart({ points }: { points: CalibrationDatum[] }) {
  return (
    <ChartContainer config={CONFIG} className="h-full w-full">
      <ScatterChart margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid />
        <XAxis
          type="number"
          dataKey="x"
          name="match score"
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="outcome"
          domain={[-0.5, 4.5]}
          ticks={[0, 1, 2, 3, 4]}
          tickFormatter={(v: number) => OUTCOME_LABEL[v] ?? ''}
          width={110}
          tickLine={false}
          axisLine={false}
        />
        <ZAxis type="number" dataKey="z" range={[40, 320]} name="count" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              valueFormatter={(v, name) =>
                name === 'y' ? (OUTCOME_LABEL[Number(v)] ?? String(v)) : String(v)
              }
            />
          }
        />
        <Scatter data={points} fill="var(--color-calibration)" />
      </ScatterChart>
    </ChartContainer>
  )
}
