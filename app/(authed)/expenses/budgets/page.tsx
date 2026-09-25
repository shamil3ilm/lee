import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as budgetsQ from '@/lib/db/queries/expenseBudgets'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { BudgetForm } from '@/components/budget-form'

export const dynamic = 'force-dynamic'

export default async function ExpenseBudgetsPage() {
  const userId = await requireUserId()
  const budgets = await budgetsQ.list(userId)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense budgets"
        description="Set a monthly spending cap per category. Overspend surfaces on /expenses and /analytics."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/expenses">
              <ChevronLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />
      <BudgetForm budgets={budgets} />
    </div>
  )
}
