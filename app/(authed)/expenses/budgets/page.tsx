import { requireUserId } from '@/lib/auth/require-session'
import * as budgetsQ from '@/lib/db/queries/expenseBudgets'
import { PageHeader } from '@/components/page-header'
import { BudgetForm } from '@/components/budget-form'

export const dynamic = 'force-dynamic'

export default async function ExpenseBudgetsPage() {
  const userId = await requireUserId()
  const budgets = await budgetsQ.list(userId)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense budgets"
        description="Set a monthly spending cap per category. Overspending is flagged on Expenses and Analytics."
      />
      <BudgetForm budgets={budgets} />
    </div>
  )
}
