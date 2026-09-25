import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { colourFor, formatMoney } from '@/lib/ui/money'

interface ExpenseCategoryCardProps {
  category: string
  totalCents: number
  count: number
  budgetCents?: number
  currency?: string
}

/**
 * Small tile showing spend for a single category, optionally with a
 * progress bar against a monthly budget cap. Rendered in a grid on the
 * /expenses page under the this-month total.
 */
export function ExpenseCategoryCard({
  category,
  totalCents,
  count,
  budgetCents,
  currency = 'AED',
}: ExpenseCategoryCardProps) {
  const hasBudget = typeof budgetCents === 'number' && budgetCents > 0
  const pct = hasBudget ? (totalCents / budgetCents!) * 100 : 0
  const overBudget = hasBudget && totalCents > budgetCents!
  const barColour = overBudget
    ? 'hsl(0 84% 60%)'
    : hasBudget && pct >= 80
      ? 'hsl(38 92% 50%)'
      : colourFor(category)
  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: colourFor(category) }}
            />
            <span className="text-sm font-semibold capitalize">{category}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {count} {count === 1 ? 'txn' : 'txns'}
          </span>
        </div>
        <div className="text-xl font-semibold tabular-nums">
          {formatMoney(totalCents, currency)}
        </div>
        {hasBudget ? (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  backgroundColor: barColour,
                }}
              />
            </div>
            <div
              className={cn(
                'text-[11px] text-muted-foreground',
                overBudget ? 'text-destructive' : undefined,
              )}
            >
              {pct.toFixed(0)}% of {formatMoney(budgetCents!, currency)}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">No budget set</div>
        )}
      </CardContent>
    </Card>
  )
}
