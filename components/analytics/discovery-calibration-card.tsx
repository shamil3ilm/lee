'use client'
import { Target } from 'lucide-react'
import {
  CartesianGrid,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AnalyticsCardShell } from './card-shell'
import type { CalibrationPoint, CalibrationOutcome } from '@/lib/analytics/service'

interface DiscoveryCalibrationCardProps {
  data: CalibrationPoint[]
}

// Y-axis encoding: higher = "better outcome" so the intuitive read of the
// scatter is "do high match scores correlate with high y values?"
const OUTCOME_Y: Record<CalibrationOutcome, number> = {
  offered: 4,
  interviewed: 3,
  applied: 2,
  saved: 1,
  rejected: 0,
  dismissed: 0,
}

const OUTCOME_LABEL: Record<number, string> = {
  0: 'Rejected / Dismissed',
  1: 'Saved',
  2: 'Applied',
  3: 'Interviewed',
  4: 'Offered',
}

const CONFIG: ChartConfig = {
  calibration: { label: 'Discoveries', color: 'hsl(258 90% 66%)' },
}

/**
 * Scatter: X = discovery match score, Y = outcome (encoded 0..4), dot size
 * encodes how many discoveries land on that (score, outcome) pair. A well
 * calibrated AI produces a positive trend from bottom-left to top-right.
 */
export function DiscoveryCalibrationCard({ data }: DiscoveryCalibrationCardProps) {
  const points = data.map((d) => ({
    x: d.matchScore,
    y: OUTCOME_Y[d.outcome],
    z: d.count,
    outcome: d.outcome,
  }))
  const isEmpty = points.length === 0

  return (
    <AnalyticsCardShell
      title="Discovery calibration"
      description="Each dot is a group of discoveries at the same match score with the same eventual outcome. Dot size scales with how many. Higher on Y = better outcome. If the AI is calibrated, expect an upward trend."
      exportMetric="discovery-calibration"
      isEmpty={isEmpty}
      emptyMessage="Discovery calibration appears once your discovery feed has scored jobs with recorded outcomes."
      emptyIcon={Target}
    >
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
    </AnalyticsCardShell>
  )
}
