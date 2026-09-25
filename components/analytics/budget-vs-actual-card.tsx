'use client'
import { Target } from 'lucide-react'
import { AnalyticsCardShell } from './card-shell'
import type { BudgetVsActualRow } from '@/lib/analytics/service'
import { colourFor, formatMoney } from '@/lib/ui/money'

interface BudgetVsActualCardProps {
  data: BudgetVsActualRow[]
}

/**
 * Horizontal bars per category showing month-to-date spend against the
 * configured budget cap. Bars turn amber past 80% and red once over
 * budget so the reader can scan overspending at a glance. Categories with
 * no budget set still render (grey bar) so the user knows to configure a
 * cap for high-spend areas.
 */
export function BudgetVsActualCard({ data }: BudgetVsActualCardProps) {
  const isEmpty =
    data.length === 0 ||
    data.every((r) => r.actualCents === 0 && r.budgetCents === 0)

  // Bars top out at max(budget, actual) so an over-budget category doesn't
  // squish the rest visually. Fallback denominator prevents divide-by-zero.
  return (
    <AnalyticsCardShell
      title="Budget vs actual"
      description="Month-to-date spend against your monthly budget caps. Bars redden past 100%."
      exportMetric="budget-vs-actual"
      isEmpty={isEmpty}
      emptyMessage="Set a budget under Expenses → Budgets to compare it against actual spend."
      emptyIcon={Target}
    >
      <div className="h-full w-full space-y-3 overflow-y-auto pr-1">
        {data.slice(0, 8).map((r) => {
          const denom = Math.max(r.budgetCents, r.actualCents, 1)
          const pctFill = Math.min(100, (r.actualCents / denom) * 100)
          const pctBudget = r.budgetCents > 0 ? (r.actualCents / r.budgetCents) * 100 : 0
          const overBudget = r.budgetCents > 0 && r.actualCents > r.budgetCents
          const nearBudget = r.budgetCents > 0 && pctBudget >= 80 && pctBudget < 100
          const barColour = r.budgetCents === 0
            ? 'hsl(215 20% 65%)'
            : overBudget
              ? 'hsl(0 84% 60%)'
              : nearBudget
                ? 'hsl(38 92% 50%)'
                : colourFor(r.category)
          const budgetMarker = r.budgetCents > 0 && r.budgetCents < denom
            ? (r.budgetCents / denom) * 100
            : null
          return (
            <div key={r.category} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium capitalize">{r.category}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(r.actualCents, r.currency)}
                  {r.budgetCents > 0 ? (
                    <>
                      {' / '}
                      <span className="text-foreground">
                        {formatMoney(r.budgetCents, r.currency)}
                      </span>
                      <span
                        className={
                          overBudget
                            ? 'ml-2 text-destructive'
                            : nearBudget
                              ? 'ml-2 text-amber-600 dark:text-amber-400'
                              : 'ml-2'
                        }
                      >
                        ({pctBudget.toFixed(0)}%)
                      </span>
                    </>
                  ) : (
                    <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                      no budget
                    </span>
                  )}
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${pctFill}%`, backgroundColor: barColour }}
                />
                {budgetMarker !== null ? (
                  <div
                    aria-hidden
                    className="absolute top-0 h-full w-px bg-foreground/70"
                    style={{ left: `${budgetMarker}%` }}
                  />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </AnalyticsCardShell>
  )
}
