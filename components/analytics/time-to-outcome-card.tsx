'use client'
import { Hourglass } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import type { TimeToOutcomeStats } from '@/lib/analytics/service'

interface TimeToOutcomeCardProps {
  data: TimeToOutcomeStats
}

/**
 * Key-numbers card (no chart) — median and p90 days from applied_at to the
 * first status change into 'offer' or 'rejected'. Sample size is exposed so
 * the reader can weigh how much to trust the numbers.
 */
export function TimeToOutcomeCard({ data }: TimeToOutcomeCardProps) {
  const isEmpty = data.offer.count === 0 && data.rejection.count === 0

  return (
    <AnalyticsCardShell
      title="Time to outcome"
      description="Median and 90th-percentile days from an application's applied date to the first status change into 'offer' or 'rejected'."
      exportMetric="time-to-outcome"
      isEmpty={isEmpty}
      emptyMessage="Move applications to offer or rejected to build up an outcome distribution."
      emptyIcon={Hourglass}
    >
      <div className="grid h-full grid-cols-2 gap-3">
        <OutcomeBlock
          label="Offer"
          median={data.offer.median}
          p90={data.offer.p90}
          count={data.offer.count}
          accent="text-success"
        />
        <OutcomeBlock
          label="Rejection"
          median={data.rejection.median}
          p90={data.rejection.p90}
          count={data.rejection.count}
          accent="text-danger"
        />
      </div>
    </AnalyticsCardShell>
  )
}

interface OutcomeBlockProps {
  label: string
  median: number
  p90: number
  count: number
  accent: string
}

function OutcomeBlock({ label, median, p90, count, accent }: OutcomeBlockProps) {
  const noData = count === 0
  return (
    <div className="flex h-full flex-col justify-between rounded-md border p-3">
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${accent}`}>{label}</div>
      {noData ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xl font-semibold tabular-nums">{median}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Median days
              </div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{p90}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                p90 days
              </div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {count === 1 ? '1 outcome' : `${count} outcomes`}
          </div>
        </>
      )}
    </div>
  )
}
