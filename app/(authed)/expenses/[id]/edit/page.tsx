import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as expensesQ from '@/lib/db/queries/expenses'
import { PageHeader } from '@/components/page-header'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ExpenseForm } from '@/components/expense-form'

export const dynamic = 'force-dynamic'

interface EditExpensePageProps {
  params: Promise<{ id: string }>
}

export default async function EditExpensePage({ params }: EditExpensePageProps) {
  const userId = await requireUserId()
  const { id } = await params
  const expense = await expensesQ.getById(userId, id)
  if (!expense) notFound()

  return (
    <div className="space-y-6">
      <Breadcrumbs
        className="-mb-3"
        items={[
          { label: 'Money' },
          { label: 'Expenses', href: '/expenses' },
          { label: expense.vendor?.trim() || 'Edit expense' },
        ]}
      />
      <PageHeader
        title="Edit expense"
        description="Update amount, category, vendor, or notes."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/expenses">
              <ChevronLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <ExpenseForm
            mode="edit"
            expenseId={expense.id}
            initial={{
              date: expense.date,
              amountCents: expense.amountCents,
              currency: expense.currency,
              category: expense.category,
              subcategory: expense.subcategory,
              vendor: expense.vendor,
              description: expense.description,
            }}
            redirectAfterEdit="/expenses"
          />
        </CardContent>
      </Card>
    </div>
  )
}
