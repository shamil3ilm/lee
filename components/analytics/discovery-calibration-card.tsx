'use client'
import dynamic from 'next/dynamic'
import { Target } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import { ChartSkeleton } from './charts/chart-skeleton'
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

const DiscoveryCalibrationChart = dynamic(
  () => import('./charts/discovery-calibration-chart').then((m) => m.DiscoveryCalibrationChart),
  { ssr: false, loading: ChartSkeleton },
)

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
      <DiscoveryCalibrationChart points={points} />
    </AnalyticsCardShell>
  )
}
