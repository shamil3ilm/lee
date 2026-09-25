'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Save, Trash2 } from 'lucide-react'
import type { ExpenseBudget } from '@/lib/db/queries/expenseBudgets'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
          <form action={onSubmit} className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="budget-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="budget-category">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monthlyCap">Monthly cap</Label>
              <Input
                id="monthlyCap"
                name="monthlyCap"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 500"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" name="currency" defaultValue={DEFAULT_CURRENCY} maxLength={6} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save budget
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {budgets.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No budgets set yet. Add a monthly cap per category above.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Monthly cap</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {b.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(b.monthlyCapCents, b.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove budget"
                        onClick={() => onDelete(b.id)}
                        disabled={pending}
                      >
                        {deletingId === b.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
