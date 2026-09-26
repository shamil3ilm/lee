'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import type { Expense } from '@/lib/db/queries/expenses'
// (Type-only import — Drizzle types erase at compile time, no runtime cost.)
import { Badge } from '@/components/ui/badge'
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
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
        {expense.date}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline" className="whitespace-nowrap text-[10px] capitalize">
          {expense.category}
          {expense.subcategory ? ` · ${expense.subcategory}` : ''}
        </Badge>
      </td>
      <td className="px-3 py-2 text-sm">
        <div className="max-w-[16rem] truncate font-medium">
          {expense.vendor ?? '—'}
        </div>
        {expense.description ? (
          <div className="max-w-[24rem] truncate text-xs text-muted-foreground">
            {expense.description}
          </div>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums">
        {formatMoney(expense.amountCents, expense.currency)}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Edit">
            <Link href={`/expenses/${expense.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete"
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
                {expense.vendor ?? 'this vendor'} on {expense.date}.
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
      </td>
    </tr>
  )
}
