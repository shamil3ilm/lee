'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, PiggyBank, Save, Trash2 } from 'lucide-react'
import type { ExpenseBudget } from '@/lib/db/queries/expenseBudgets'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { FormActions, FormField } from '@/components/ui/form-field'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { deleteBudget, upsertBudget } from '@/app/(authed)/expenses/actions'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'
import { formatMoney } from '@/lib/ui/money'
import { DEFAULT_CURRENCY } from '@/lib/money/currency'

interface BudgetFormProps {
  budgets: ExpenseBudget[]
}

export function BudgetForm({ budgets }: BudgetFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<ExpenseBudget | null>(null)
  const [category, setCategory] = useState<string>('food')

  function onSubmit(fd: FormData): void {
    fd.set('category', category)
    startTransition(async () => {
      const result = await upsertBudget(fd)
      if ('success' in result) {
        toast.success('Budget saved')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function onDelete(id: string): void {
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteBudget(id)
      if ('success' in result) {
        toast.success('Budget removed')
        setConfirming(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <form
            action={onSubmit}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto]"
          >
            <FormField htmlFor="budget-category" label="Category">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="budget-category" className="capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField htmlFor="monthlyCap" label="Monthly cap">
              <Input
                id="monthlyCap"
                name="monthlyCap"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 500"
                required
              />
            </FormField>
            <FormField htmlFor="currency" label="Currency">
              <Input id="currency" name="currency" defaultValue={DEFAULT_CURRENCY} maxLength={6} />
            </FormField>
            <FormActions>
              <Button type="submit" disabled={pending} className="w-full xl:w-auto">
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save budget
              </Button>
            </FormActions>
          </form>
        </CardContent>
      </Card>

      {budgets.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="No budgets set yet."
          description="Pick a category and a monthly cap above. Spending over a cap is flagged on Expenses and Analytics."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Monthly cap</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {b.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(b.monthlyCapCents, b.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${b.category} budget`}
                      onClick={() => setConfirming(b)}
                      disabled={pending}
                    >
                      {deletingId === b.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={`Remove the ${confirming?.category ?? ''} budget?`}
        description={<p>Your expenses are kept; only the monthly cap is removed.</p>}
        confirmLabel="Remove"
        pending={pending}
        onConfirm={() => {
          if (confirming) onDelete(confirming.id)
        }}
      />
    </div>
  )
}
