'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import type { Expense } from '@/lib/db/queries/expenses'
// (Type-only import — Drizzle types erase at compile time, no runtime cost.)
import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { shortDay } from '@/lib/ui/date'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteExpense } from '@/app/(authed)/expenses/actions'
import { formatMoney } from '@/lib/ui/money'

interface ExpenseRowProps {
  expense: Expense
}

/**
 * One-line rendering of an expense, used inside the recent-transactions
 * table on /expenses. Delete is confirmed via a small dialog so a stray
 * click doesn't nuke data.
 */
export function ExpenseRow({ expense }: ExpenseRowProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function performDelete(): void {
    startTransition(async () => {
      const result = await deleteExpense(expense.id)
      if ('success' in result) {
        toast.success('Expense deleted')
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setConfirming(false)
    })
  }

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {shortDay(expense.date)}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <Badge variant="outline" className="whitespace-nowrap capitalize">
          {expense.category}
          {expense.subcategory ? ` · ${expense.subcategory}` : ''}
        </Badge>
      </TableCell>
      <TableCell className="max-w-0 w-full">
        <div className="truncate font-medium">{expense.vendor ?? '—'}</div>
        {/* Narrow screens drop the category column; show it under the vendor. */}
        <div className="truncate text-xs capitalize text-muted-foreground lg:hidden">
          {expense.category}
          {expense.subcategory ? ` · ${expense.subcategory}` : ''}
        </div>
        {expense.description ? (
          <div className="truncate text-xs text-muted-foreground">{expense.description}</div>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">
        {formatMoney(expense.amountCents, expense.currency)}
      </TableCell>
      <TableCell className="w-px whitespace-nowrap pl-0 text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Button asChild variant="ghost" size="icon" aria-label="Edit expense">
            <Link href={`/expenses/${expense.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete expense"
            onClick={() => setConfirming(true)}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
        </div>
        <Dialog
          open={confirming}
          onOpenChange={(open) => {
            if (!open) setConfirming(false)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete expense?</DialogTitle>
              <DialogDescription>
                This will permanently remove the {expense.category} expense from{' '}
                {expense.vendor ?? 'this vendor'} on {shortDay(expense.date)}.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={performDelete}
                disabled={pending}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  )
}
