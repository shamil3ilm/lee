import type { Metadata } from 'next'
import { Gauge } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as vitalsQ from '@/lib/db/queries/webVitals'
import { buildVitalsReport } from '@/lib/vitals/report'
import { VITAL_LABELS, VITAL_METRICS, VITAL_THRESHOLDS, type VitalMetric } from '@/lib/vitals/metrics'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { VitalsTrend } from '@/components/analytics/vitals-trend'
import {
  formatVital,
  RATING_BAR_CLASS,
  RATING_CLASS,
  RATING_LABEL,
} from '@/components/analytics/vitals-format'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Performance' }

const WINDOW_DAYS = 28

function windowDays(now: Date): { fromDay: string; toDay: string } {
  const toDay = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - (WINDOW_DAYS - 1) * 86_400_000)
  return { fromDay: from.toISOString().slice(0, 10), toDay }
}

function thresholdText(metric: VitalMetric): string {
  const t = VITAL_THRESHOLDS[metric]
  return `good ≤ ${formatVital(metric, t.good)}, poor > ${formatVital(metric, t.poor)}`
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`
}

/**
 * Analytics › Performance: real page-load web vitals from this browser
 * (components/web-vitals-reporter.tsx), p75 per route over the last 28 days
 * against Google's thresholds, plus a daily trend per metric.
 */
export default async function PerformancePage() {
  const userId = await requireUserId()
  const window = windowDays(new Date())
  const rows = await vitalsQ.listSince(userId, window.fromDay)
  const report = buildVitalsReport(rows, window)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance"
        description={`How fast lee loads for you: web vitals at the 75th percentile over the last ${WINDOW_DAYS} days, from ${report.totalLoads} page loads.`}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No measurements yet"
          description="Each full page load reports its web vitals here. Browse around the app and check back."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {report.overall.map((o) => (
              <Card key={o.metric} className="min-w-0">
                <CardHeader className="space-y-1 pb-2">
                  <CardTitle className="text-sm font-semibold" title={VITAL_LABELS[o.metric]}>
                    {o.metric}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{thresholdText(o.metric)}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums">{formatVital(o.metric, o.p75)}</span>
                    {o.rating ? (
                      <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', RATING_CLASS[o.rating])}>
                        {RATING_LABEL[o.rating]}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-label="Share of samples by rating">
                    {(['good', 'needs-improvement', 'poor'] as const).map((r) => (
                      <div key={r} className={RATING_BAR_CLASS[r]} style={{ width: percent(o.shares[r]) }} />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {o.count} samples · {percent(o.shares.good)} good
                  </p>
                  <VitalsTrend metric={o.metric} points={report.trend[o.metric]} />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">By route (p75)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Loads</TableHead>
                    {VITAL_METRICS.map((m) => (
                      <TableHead key={m} className="text-right">
                        {m}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.routes.map((r) => (
                    <TableRow key={r.route}>
                      <TableCell className="font-mono text-xs">{r.route}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.loads}</TableCell>
                      {VITAL_METRICS.map((m) => {
                        const s = r.metrics[m]
                        return (
                          <TableCell key={m} className="text-right">
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-xs tabular-nums',
                                s.rating ? RATING_CLASS[s.rating] : 'text-muted-foreground',
                              )}
                              title={s.count ? `${s.count} samples` : 'No samples'}
                            >
                              {formatVital(m, s.p75)}
                            </span>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <DimsSummary dims={report.dims} />
        </>
      )}
    </div>
  )
}

function DimsSummary({ dims }: { dims: Record<string, number> }) {
  const groups = [
    { prefix: 'device:', label: 'Device' },
    { prefix: 'conn:', label: 'Connection' },
    { prefix: 'nav:', label: 'Navigation' },
  ]
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-muted-foreground">
      {groups.map((g) => {
        const parts = Object.entries(dims)
          .filter(([k]) => k.startsWith(g.prefix))
          .sort((a, b) => b[1] - a[1])
          .map(([k, share]) => `${k.slice(g.prefix.length)} ${percent(share)}`)
        return parts.length ? (
          <p key={g.prefix}>
            <span className="font-medium text-foreground">{g.label}:</span> {parts.join(' · ')}
          </p>
        ) : null
      })}
    </div>
  )
}
