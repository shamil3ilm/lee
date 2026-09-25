'use client'
import { CalendarCheck } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import type { AdherenceCell } from '@/lib/analytics/service'
import { formatMoney } from '@/lib/ui/money'

interface BudgetAdherenceHistoryCardProps {
  data: AdherenceCell[]
}

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
 */
export function BudgetAdherenceHistoryCard({ data }: BudgetAdherenceHistoryCardProps) {
  const isEmpty = data.length === 0

  const monthsSet = new Set<string>()
  const categoriesSet = new Set<string>()
  const byKey = new Map<string, AdherenceCell>()
  for (const c of data) {
    monthsSet.add(c.month)
    categoriesSet.add(c.category)
    byKey.set(`${c.category}:${c.month}`, c)
  }
  const months = Array.from(monthsSet).sort()
  const categories = Array.from(categoriesSet).sort()

  return (
    <AnalyticsCardShell
      title="Budget adherence"
      description="Which categories came in under or over budget each month for the last 12 months. Green = under, red = over."
      exportMetric="budget-adherence-history"
      isEmpty={isEmpty}
      emptyMessage="Set a monthly budget for a category and log spend to see history."
      emptyIcon={CalendarCheck}
    >
      <div className="h-full w-full overflow-auto">
        <table className="w-full border-separate border-spacing-1 text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background px-1 text-left font-semibold text-muted-foreground">
                Category
              </th>
              {months.map((m) => (
                <th key={m} className="px-1 font-semibold text-muted-foreground">
                  {shortMonthLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c}>
                <td className="sticky left-0 z-10 bg-background px-1 py-0.5 text-left capitalize text-muted-foreground">
                  {c}
                </td>
                {months.map((m) => {
                  const cell = byKey.get(`${c}:${m}`)
                  if (!cell) {
                    return (
                      <td
                        key={m}
                        className="h-6 rounded bg-neutral-100 dark:bg-neutral-900"
                        title={`${c} · ${m}: no data`}
                      />
                    )
                  }
                  const isOver = cell.adherence === 'over'
                  const className = isOver
                    ? 'bg-rose-200/70 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200'
                    : 'bg-emerald-200/70 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                  return (
                    <td
                      key={m}
                      className={`h-6 rounded px-1 text-center font-medium ${className}`}
                      title={`${c} · ${m}: ${formatMoney(cell.spentCents)} spent · budget ${
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
