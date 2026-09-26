import { VITAL_THRESHOLDS, type VitalMetric } from '@/lib/vitals/metrics'
import type { TrendPoint } from '@/lib/vitals/report'
import { formatVital } from './vitals-format'

interface VitalsTrendProps {
  metric: VitalMetric
  points: TrendPoint[]
}

const W = 280
const H = 72
const PAD = 4

/**
 * Daily p75 as a small server-rendered SVG (no chart library on this page):
 * one dot per day with data, joined by a line, over the good / poor
 * threshold lines. Fixed size, so it never shifts layout.
 */
export function VitalsTrend({ metric, points }: VitalsTrendProps) {
  const { good, poor } = VITAL_THRESHOLDS[metric]
  const values = points.map((p) => p.p75).filter((v): v is number => v !== null)
  const max = Math.max(poor * 1.2, ...values)
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, points.length - 1)
  const y = (v: number) => H - PAD - (Math.min(v, max) / max) * (H - 2 * PAD)
  const dots = points
    .map((p, i) => (p.p75 === null ? null : { x: x(i), y: y(p.p75), p }))
    .filter((d): d is NonNullable<typeof d> => d !== null)
  const path = dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' ')
  const first = points[0]?.day
  const last = points[points.length - 1]?.day
  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[72px] w-full"
        role="img"
        aria-label={`${metric} daily p75 from ${first} to ${last}`}
        preserveAspectRatio="none"
      >
        <line x1={0} x2={W} y1={y(good)} y2={y(good)} className="stroke-success" strokeDasharray="3 3" strokeWidth={1} />
        <line x1={0} x2={W} y1={y(poor)} y2={y(poor)} className="stroke-danger" strokeDasharray="3 3" strokeWidth={1} />
        {path ? <path d={path} fill="none" className="stroke-primary" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /> : null}
        {dots.map((d) => (
          <circle key={d.p.day} cx={d.x} cy={d.y} r={2} className="fill-primary">
            <title>{`${d.p.day}: p75 ${formatVital(metric, d.p.p75)} (${d.p.count} samples)`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="flex justify-between text-[11px] text-muted-foreground">
        <span>{first}</span>
        <span>{last}</span>
      </figcaption>
    </figure>
  )
}
