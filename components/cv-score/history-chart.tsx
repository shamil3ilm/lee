'use client'
import { categorical } from '@/lib/ui/chart-palette'
import { DISPLAY_LOCALE } from '@/lib/ui/date'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { CHART_MARGIN, LEGEND_PROPS, TIME_AXIS, VALUE_AXIS, lineProps } from '@/components/ui/chart-defaults'
import { isOutdatedScore, SCORER_VERSION } from '@/lib/cv-score/version'
import type { HistoryPoint } from './client'

const config: ChartConfig = {
  total: { label: 'Total', color: categorical(0) },
  ats: { label: 'ATS', color: categorical(1) },
  impact: { label: 'Impact', color: categorical(4) },
}

/** Score history (oldest → newest) for the current CV / application. */
export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        {points.length === 1 ? 'Score again after editing to see a trend.' : 'No history yet.'}
      </p>
    )
  }
  const olderRuns = points.map((p, i) => (isOutdatedScore(p.scorerVersion) ? i + 1 : 0)).filter((n) => n > 0)
  const data = points.map((p, i) => ({
    run: `#${i + 1}`,
    label: new Date(p.createdAt).toLocaleDateString(DISPLAY_LOCALE),
    total: p.scores.total ?? p.overall,
    ats: p.scores.ats ?? null,
    impact: p.scores.impact ?? null,
  }))
  return (
    <div className="space-y-1.5">
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="run" {...TIME_AXIS} />
          <YAxis domain={[0, 100]} {...VALUE_AXIS} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend {...LEGEND_PROPS} content={<ChartLegendContent />} />
          <Line dataKey="total" stroke="var(--color-total)" fill="var(--color-total)" {...lineProps(data.length)} />
          <Line dataKey="ats" stroke="var(--color-ats)" fill="var(--color-ats)" {...lineProps(data.length)} strokeWidth={1.5} />
          <Line dataKey="impact" stroke="var(--color-impact)" fill="var(--color-impact)" {...lineProps(data.length)} strokeWidth={1.5} />
        </LineChart>
      </ChartContainer>
      {olderRuns.length ? (
        <p className="text-xs text-muted-foreground" data-testid="cv-history-older">
          {olderRuns.length === 1 ? `Run #${olderRuns[0]} was` : `Runs ${olderRuns.map((n) => `#${n}`).join(', ')} were`}{' '}
          scored with an older scorer version. v{SCORER_VERSION} uses different rules, so compare runs of the same version.
        </p>
      ) : null}
    </div>
  )
}
