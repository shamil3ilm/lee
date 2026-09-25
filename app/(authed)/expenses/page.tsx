import Link from 'next/link'
import { Download, Wallet } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as expensesQ from '@/lib/db/queries/expenses'
import * as budgetsQ from '@/lib/db/queries/expenseBudgets'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ExpenseForm } from '@/components/expense-form'
import { ExpenseRow } from '@/components/expense-row'
import { ExpenseCategoryCard } from '@/components/expense-category-card'
import { ExpenseMonthPicker } from '@/components/expense-month-picker'
import { formatMoney } from '@/lib/ui/money'

export const dynamic = 'force-dynamic'

const MONTH_RX = /^\d{4}-(0[1-9]|1[0-2])$/

function currentMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function labelForMonth(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

interface ExpensesPageProps {
  searchParams: Promise<{ month?: string | string[] }>
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const userId = await requireUserId()
  const params = await searchParams
  const rawMonth = typeof params.month === 'string' ? params.month : undefined
  const month = rawMonth && MONTH_RX.test(rawMonth) ? rawMonth : currentMonth()

  const [monthExpenses, categoryTotals, budgets] = await Promise.all([
    expensesQ.listMonth(userId, month),
    expensesQ.sumByCategory(userId, month),
    budgetsQ.list(userId),
  ])

  const budgetByCategory = new Map(budgets.map((b) => [b.category, b]))
  const monthTotalCents = categoryTotals.reduce((s, r) => s + r.totalCents, 0)
  const currency =
    monthExpenses[0]?.currency ?? budgets[0]?.currency ?? 'AED'
  const topCategories = categoryTotals.slice(0, 6)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Personal spending log with monthly totals, budgets, and category breakdowns."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExpenseMonthPicker value={month} />
            <Button asChild variant="ghost" size="sm">
              <Link href="/api/expenses/export" prefetch={false}>
                <Download className="size-4" />
                Export
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {labelForMonth(month)}
              </div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">
                {formatMoney(monthTotalCents, currency)}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {monthExpenses.length}{' '}
              {monthExpenses.length === 1 ? 'transaction' : 'transactions'}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <ExpenseForm mode="create" />
        </CardContent>
      </Card>

      {topCategories.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Top categories this month
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {topCategories.map((c) => {
              const budget = budgetByCategory.get(c.category)
              return (
                <ExpenseCategoryCard
                  key={c.category}
                  category={c.category}
                  totalCents={c.totalCents}
                  count={c.count}
                  budgetCents={budget?.monthlyCapCents}
                  currency={budget?.currency ?? currency}
                />
              )
            })}
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent transactions
        </h2>
        {monthExpenses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Wallet className="size-6" />
              <p className="font-medium text-foreground">No expenses this month.</p>
              <p>Log an expense above or import a CSV to backfill.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {monthExpenses.map((e) => (
                    <ExpenseRow key={e.id} expense={e} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
