import { and, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { expenseBudgets } from '@/lib/db/schema'
import { DEFAULT_CURRENCY } from '@/lib/money/currency'

export type ExpenseBudget = typeof expenseBudgets.$inferSelect
export type NewExpenseBudget = typeof expenseBudgets.$inferInsert

export async function list(
  userId: string,
  client: DbClient = db,
): Promise<ExpenseBudget[]> {
  return client
    .select()
    .from(expenseBudgets)
    .where(eq(expenseBudgets.userId, userId))
    .orderBy(expenseBudgets.category)
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<ExpenseBudget | null> {
  const [row] = await client
    .select()
    .from(expenseBudgets)
    .where(and(eq(expenseBudgets.userId, userId), eq(expenseBudgets.id, id)))
    .limit(1)
  return row ?? null
}

/**
 * Upsert by (userId, category) — the unique index guarantees at most one row
 * per user/category, so this either inserts a new budget or overwrites the
 * cap on the existing one. Returns the resulting row.
 */
export async function upsert(
  userId: string,
  data: {
    category: string
    monthlyCapCents: number
    currency?: string
  },
  client: DbClient = db,
): Promise<ExpenseBudget> {
  const currency = data.currency ?? DEFAULT_CURRENCY
  const [row] = await client
    .insert(expenseBudgets)
    .values({
      userId,
      category: data.category,
      monthlyCapCents: data.monthlyCapCents,
      currency,
    })
    .onConflictDoUpdate({
      target: [expenseBudgets.userId, expenseBudgets.category],
      set: {
        monthlyCapCents: data.monthlyCapCents,
        currency,
        updatedAt: new Date(),
      },
    })
    .returning()
  if (!row) throw new Error('failed to upsert expense budget')
  return row
}

export async function remove(userId: string, id: string, client: DbClient = db): Promise<void> {
  await client
    .delete(expenseBudgets)
    .where(and(eq(expenseBudgets.userId, userId), eq(expenseBudgets.id, id)))
}
