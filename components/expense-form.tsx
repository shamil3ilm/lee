'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { addExpense, updateExpense } from '@/app/(authed)/expenses/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EXPENSE_CATEGORIES, isExpenseCategory } from '@/lib/expenses/categories'
import { VoiceInputButton } from '@/components/voice-input-button'

interface ExpenseFormProps {
  mode: 'create' | 'edit'
  expenseId?: string
  initial?: {
    date: string
    amountCents: number
    currency: string
    category: string
    subcategory?: string | null
    vendor?: string | null
    description?: string | null
  }
  redirectAfterEdit?: string
}

function todayIso(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Quick-add & edit form for a single expense. Field order matches the
 * one-tap flow: Amount → Category → Vendor → Date, with optional fields
 * tucked below. Submits to the appropriate server action based on `mode`.
 */
export function ExpenseForm({
  mode,
  expenseId,
  initial,
  redirectAfterEdit,
}: ExpenseFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [category, setCategory] = useState(initial?.category ?? 'other')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [vendor, setVendor] = useState(initial?.vendor ?? '')
  const [autoBusy, setAutoBusy] = useState(false)

  const defaultAmount =
    initial ? (initial.amountCents / 100).toFixed(2) : ''

  async function autoCategorize(): Promise<void> {
    const seed = [description.trim(), vendor.trim()].filter(Boolean).join(' ')
    if (!seed) {
      toast.info('Add a description or vendor first.')
      return
    }
    setAutoBusy(true)
    try {
      const res = await fetch('/api/expenses/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim() || undefined,
          vendor: vendor.trim() || undefined,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        category?: string
        confidence?: number
        error?: string
      }
      if (res.ok && typeof json.category === 'string' && isExpenseCategory(json.category)) {
        setCategory(json.category)
        toast.success(
          `Category set to ${json.category}${
            typeof json.confidence === 'number'
              ? ` (${Math.round(json.confidence * 100)}% conf)`
              : ''
          }`,
        )
      } else {
        toast.error(json.error ?? 'Could not auto-categorize.')
      }
    } catch {
      toast.error('Network error — could not auto-categorize.')
    } finally {
      setAutoBusy(false)
    }
  }

  function onSubmit(fd: FormData): void {
    // Keep the controlled category value in sync with the form payload.
    fd.set('category', category)
    startTransition(async () => {
      const result =
        mode === 'edit' && expenseId
          ? await updateExpense(expenseId, fd)
          : await addExpense(fd)
      if ('success' in result) {
        toast.success(mode === 'edit' ? 'Expense updated' : 'Expense added')
        if (mode === 'edit' && redirectAfterEdit) {
          router.push(redirectAfterEdit)
        } else {
          router.refresh()
          // Reset only in create mode so the next entry starts from a blank
          // slate; leave the current category preselected for rapid entry.
          if (mode === 'create') {
            const form = document.getElementById('expense-form') as HTMLFormElement | null
            form?.reset()
            setDescription('')
            setVendor('')
          }
        }
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form id="expense-form" action={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 42.50"
            defaultValue={defaultAmount}
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <div className="flex items-stretch gap-1.5">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category" className="flex-1">
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              disabled={autoBusy}
              onClick={() => {
                void autoCategorize()
              }}
              title="Auto-categorize from description + vendor"
              aria-label="Auto-categorize"
            >
              {autoBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor">Vendor</Label>
          <Input
            id="vendor"
            name="vendor"
            placeholder="e.g. Netflix"
            value={vendor}
            onChange={(e) => setVendor(e.currentTarget.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={initial?.date ?? todayIso()}
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="subcategory">Subcategory</Label>
          <Input
            id="subcategory"
            name="subcategory"
            placeholder="e.g. streaming"
            defaultValue={initial?.subcategory ?? ''}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={initial?.currency ?? 'AED'}
            maxLength={6}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="description">Description</Label>
          <div className="flex items-stretch gap-1.5">
            <Input
              id="description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              autoComplete="off"
              className="flex-1"
            />
            <VoiceInputButton
              onTranscribed={(text) => {
                setDescription((prev) => (prev ? `${prev} ${text}` : text))
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {mode === 'edit' ? 'Save changes' : 'Add expense'}
        </Button>
      </div>
    </form>
  )
}
