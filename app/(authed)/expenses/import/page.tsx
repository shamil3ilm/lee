import { PageHeader } from '@/components/page-header'
import { ExpenseImportForm } from '@/components/expense-import-form'

export const dynamic = 'force-dynamic'

export default function ExpenseImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import expenses"
        description="Paste or upload a CSV to backfill expenses in bulk."
      />
      <ExpenseImportForm />
    </div>
  )
}
