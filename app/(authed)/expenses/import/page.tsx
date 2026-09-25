import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ExpenseImportForm } from '@/components/expense-import-form'

export const dynamic = 'force-dynamic'

export default function ExpenseImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import expenses"
        description="Paste or upload a CSV to backfill expenses in bulk."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/expenses">
              <ChevronLeft className="size-4" />
              Back
            </Link>
          </Button>
        }
      />
      <ExpenseImportForm />
    </div>
  )
}
