'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as expensesQ from '@/lib/db/queries/expenses'
import * as budgetsQ from '@/lib/db/queries/expenseBudgets'
import { logger } from '@/lib/logger'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string }

/**
 * Parse the amount input from the quick-add form. Users typically type
 * amounts in major units ("12.50") not cents; convert to integer minor
 * units at the boundary so the DB stays exact.
 */
function amountToCents(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[^\d.\-]/g, '').trim()
  if (!cleaned) return null
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

const categorySchema = z
  .string()
  .refine((v) => expensesQ.isExpenseCategory(v), 'unknown category')

/**
 * Add an expense from the quick-add form. Called via <form action={...}>
 * so it takes a FormData directly.
 */
export async function addExpense(fd: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId()
    const amountCents = amountToCents(fd.get('amount'))
    if (amountCents === null) {
      return { error: 'Amount is required.' }
    }
    const category = String(fd.get('category') ?? '').trim()
    if (!categorySchema.safeParse(category).success) {
      return { error: 'Pick a valid category.' }
    }
    const date = String(fd.get('date') ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: 'Date must be YYYY-MM-DD.' }
    }
    const vendor = String(fd.get('vendor') ?? '').trim() || null
    const subcategory = String(fd.get('subcategory') ?? '').trim() || null
    const description = String(fd.get('description') ?? '').trim() || null
    const currency = (String(fd.get('currency') ?? '').trim() || 'AED').toUpperCase()
    const row = await expensesQ.create(userId, {
      date,
      amountCents,
      currency,
      category,
      subcategory,
      vendor,
      description,
    })
    revalidatePath('/expenses')
    revalidatePath('/analytics')
    return { success: true, data: { id: row.id } }
  } catch (err) {
    logger.error('addExpense failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not add expense.' }
  }
}

export async function updateExpense(
  id: string,
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId()
    const patch: Record<string, unknown> = {}
    const amount = amountToCents(fd.get('amount'))
    if (amount !== null) patch.amountCents = amount
    const category = String(fd.get('category') ?? '').trim()
    if (category) {
      if (!categorySchema.safeParse(category).success) {
        return { error: 'Pick a valid category.' }
      }
      patch.category = category
    }
    const date = String(fd.get('date') ?? '').trim()
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date must be YYYY-MM-DD.' }
      patch.date = date
    }
    patch.vendor = String(fd.get('vendor') ?? '').trim() || null
    patch.subcategory = String(fd.get('subcategory') ?? '').trim() || null
    patch.description = String(fd.get('description') ?? '').trim() || null
    const currency = String(fd.get('currency') ?? '').trim()
    if (currency) patch.currency = currency.toUpperCase()
    const row = await expensesQ.update(userId, id, patch)
    if (!row) return { error: 'Expense not found.' }
    revalidatePath('/expenses')
    revalidatePath('/analytics')
    return { success: true, data: { id: row.id } }
  } catch (err) {
    logger.error('updateExpense failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update expense.' }
  }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const existing = await expensesQ.getById(userId, id)
    if (!existing) return { error: 'Expense not found.' }
    await expensesQ.remove(userId, id)
    revalidatePath('/expenses')
    revalidatePath('/analytics')
    return { success: true, data: undefined }
  } catch (err) {
    logger.error('deleteExpense failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not delete expense.' }
  }
}

export async function upsertBudget(fd: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId()
    const category = String(fd.get('category') ?? '').trim()
    if (!categorySchema.safeParse(category).success) {
      return { error: 'Pick a valid category.' }
    }
    const cap = amountToCents(fd.get('monthlyCap'))
    if (cap === null || cap < 0) return { error: 'Monthly cap is required.' }
    const currency = (String(fd.get('currency') ?? '').trim() || 'AED').toUpperCase()
    const row = await budgetsQ.upsert(userId, {
      category,
      monthlyCapCents: cap,
      currency,
    })
    revalidatePath('/expenses/budgets')
    revalidatePath('/expenses')
    revalidatePath('/analytics')
    return { success: true, data: { id: row.id } }
  } catch (err) {
    logger.error('upsertBudget failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save budget.' }
  }
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const existing = await budgetsQ.getById(userId, id)
    if (!existing) return { error: 'Budget not found.' }
    await budgetsQ.remove(userId, id)
    revalidatePath('/expenses/budgets')
    revalidatePath('/expenses')
    revalidatePath('/analytics')
    return { success: true, data: undefined }
  } catch (err) {
    logger.error('deleteBudget failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not delete budget.' }
  }
}
