'use client'
import { CalendarCheck } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import type { AdherenceCell } from '@/lib/analytics/service'
import { formatMoney } from '@/lib/ui/money'
import { humanizeLabel } from '@/lib/ui/labels'
import { cn } from '@/lib/utils'

interface BudgetAdherenceHistoryCardProps {
  data: AdherenceCell[]
}

/** Months still shown when the card is too narrow for the full year. */
const NARROW_MONTHS = 6

function shortMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}

/**
 * Heatmap-style grid of (row=category, col=month) coloured by whether the
 * category came in under or over its budget cap. Categories with no cap
 * fall into "over" if they had any spend, so unbudgeted spend is still
 * visible.
 *
 * The grid grows to its natural height (no inner scroll), and on narrow
 * cards the older months collapse so the latest NARROW_MONTHS always fit.
 */
export function BudgetAdherenceHistoryCard({ data }: BudgetAdherenceHistoryCardProps) {
  const isEmpty = data.length === 0

  const byKey = new Map(data.map((c) => [`${c.category}:${c.month}`, c] as const))
  const months = Array.from(new Set(data.map((c) => c.month))).sort()
  const categories = Array.from(new Set(data.map((c) => c.category))).sort()
  const olderCol = (i: number): string | undefined =>
    i < months.length - NARROW_MONTHS ? 'hidden @[30rem]:table-cell' : undefined

  return (
    <AnalyticsCardShell
      title="Budget adherence"
      description="Which categories came in under or over budget each month for the last 12 months. Green = under, red = over."
      exportMetric="budget-adherence-history"
      isEmpty={isEmpty}
      emptyMessage="Set a monthly budget for a category and log spend to see history."
      emptyIcon={CalendarCheck}
      body="content"
    >
      <div className="@container w-full overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-1 text-left font-semibold text-muted-foreground">
                Category
              </th>
              {months.map((m, i) => (
                <th key={m} className={cn('px-1 font-semibold text-muted-foreground', olderCol(i))}>
                  {shortMonthLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c}>
                <td className="sticky left-0 z-10 max-w-24 truncate bg-card px-1 py-0.5 text-left text-muted-foreground">
                  {humanizeLabel(c)}
                </td>
                {months.map((m, i) => {
                  const cell = byKey.get(`${c}:${m}`)
                  if (!cell) {
                    return (
                      <td
                        key={m}
                        className={cn('h-6 rounded bg-neutral-soft', olderCol(i))}
                        title={`${humanizeLabel(c)} · ${shortMonthLabel(m)}: no data`}
                      />
                    )
                  }
                  const isOver = cell.adherence === 'over'
                  return (
                    <td
                      key={m}
                      className={cn(
                        'h-6 rounded px-1 text-center font-medium',
                        isOver ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
                        olderCol(i),
                      )}
                      title={`${humanizeLabel(c)} · ${shortMonthLabel(m)}: ${formatMoney(cell.spentCents)} spent · budget ${
                        cell.budgetCents > 0 ? formatMoney(cell.budgetCents) : 'none'
                      }`}
                    >
                      {isOver ? 'over' : 'ok'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalyticsCardShell>
  )
}
