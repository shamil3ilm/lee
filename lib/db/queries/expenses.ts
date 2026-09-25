import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { expenses } from '@/lib/db/schema'

export type Expense = typeof expenses.$inferSelect
export type NewExpense = typeof expenses.$inferInsert

/**
 * Ordered list of top-level categories the UI knows how to render (labels,
 * colours, icons). New categories should be appended, not reordered — every
 * consumer (charts, budget form, quick-add select) reads this array directly.
 */
export const EXPENSE_CATEGORIES = [
  'subscription',
  'food',
  'groceries',
  'dining',
  'electricity',
  'utilities',
  'water',
  'internet',
  'transport',
  'fuel',
  'housing',
  'rent',
  'mortgage',
  'health',
  'insurance',
  'entertainment',
  'education',
  'shopping',
  'travel',
  'gifts',
  'fees',
  'tax',
  'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export function isExpenseCategory(v: string): v is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(v)
}

/** Return `YYYY-MM-01` and `YYYY-MM-31` bounds for a `YYYY-MM` string. */
function monthBounds(yyyyMm: string): { from: string; to: string } {
  // Use string arithmetic to sidestep timezone drift; the DB `date` column
  // is compared lexicographically which lines up with ISO YYYY-MM-DD.
  return { from: `${yyyyMm}-01`, to: `${yyyyMm}-31` }
}

export async function create(
  userId: string,
  data: Omit<NewExpense, 'userId' | 'id' | 'createdAt' | 'updatedAt'>,
  client: DbClient = db,
): Promise<Expense> {
  const [row] = await client
    .insert(expenses)
    .values({ ...data, userId })
    .returning()
  if (!row) throw new Error('failed to insert expense')
  return row
}

/**
 * Batch-insert. Returns the inserted rows in order. Used by the CSV import
 * route to avoid one round-trip per line.
 */
export async function createMany(
  userId: string,
  rows: Array<Omit<NewExpense, 'userId' | 'id' | 'createdAt' | 'updatedAt'>>,
  client: DbClient = db,
): Promise<Expense[]> {
  if (rows.length === 0) return []
  const inserted = await client
    .insert(expenses)
    .values(rows.map((r) => ({ ...r, userId })))
    .returning()
  return inserted
}

export async function list(
  userId: string,
  client: DbClient = db,
): Promise<Expense[]> {
  return client
    .select()
    .from(expenses)
    .where(eq(expenses.userId, userId))
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
}

export async function listMonth(
  userId: string,
  yyyyMm: string,
  client: DbClient = db,
): Promise<Expense[]> {
  const { from, to } = monthBounds(yyyyMm)
  return client
    .select()
    .from(expenses)
    .where(and(eq(expenses.userId, userId), gte(expenses.date, from), lte(expenses.date, to)))
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Expense | null> {
  const [row] = await client
    .select()
    .from(expenses)
    .where(and(eq(expenses.userId, userId), eq(expenses.id, id)))
    .limit(1)
  return row ?? null
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<Omit<NewExpense, 'id' | 'userId' | 'createdAt'>>,
  client: DbClient = db,
): Promise<Expense | null> {
  const [row] = await client
    .update(expenses)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(expenses.userId, userId), eq(expenses.id, id)))
    .returning()
  return row ?? null
}

export async function remove(userId: string, id: string, client: DbClient = db): Promise<void> {
  await client.delete(expenses).where(and(eq(expenses.userId, userId), eq(expenses.id, id)))
}

export interface CategoryTotal {
  category: string
  totalCents: number
  count: number
}

/**
 * Sum expenses grouped by category for a single month. Returns one row per
 * category present in the data — categories with zero spend are omitted so
 * the UI can decide how to display "no data" for that slot.
 */
export async function sumByCategory(
  userId: string,
  yyyyMm: string,
  client: DbClient = db,
): Promise<CategoryTotal[]> {
  const { from, to } = monthBounds(yyyyMm)
  const rows = await client
    .select({
      category: expenses.category,
      totalCents: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), gte(expenses.date, from), lte(expenses.date, to)))
    .groupBy(expenses.category)
  return rows
    .map((r) => ({
      category: r.category,
      totalCents: Number(r.totalCents),
      count: Number(r.count),
    }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

export interface MonthTotal {
  month: string // YYYY-MM
  totalCents: number
  perCategory: Array<{ category: string; totalCents: number }>
}

/**
 * Sum expenses per (month, category) over the last `months` calendar months
 * (inclusive of the current month). Returns one entry per month, with an
 * empty `perCategory` array for quiet months so the stacked bar chart has a
 * continuous X axis.
 */
export async function sumByMonth(
  userId: string,
  months = 6,
  client: DbClient = db,
): Promise<MonthTotal[]> {
  if (months < 1) return []
  const now = new Date()
  const monthKeys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const oldestKey = monthKeys[0]!
  const fromDate = `${oldestKey}-01`

  const rows = await client
    .select({
      date: expenses.date,
      category: expenses.category,
      amountCents: expenses.amountCents,
    })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), gte(expenses.date, fromDate)))

  const byMonth = new Map<string, Map<string, number>>()
  for (const key of monthKeys) byMonth.set(key, new Map())

  for (const r of rows) {
    // Extract the YYYY-MM prefix from the date string — the driver returns
    // Postgres `date` as an ISO string like `2026-09-25`.
    const monthKey = String(r.date).slice(0, 7)
    const bucket = byMonth.get(monthKey)
    if (!bucket) continue
    bucket.set(r.category, (bucket.get(r.category) ?? 0) + Number(r.amountCents))
  }

  return monthKeys.map((month) => {
    const bucket = byMonth.get(month) ?? new Map<string, number>()
    const perCategory = Array.from(bucket.entries())
      .map(([category, totalCents]) => ({ category, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents)
    const totalCents = perCategory.reduce((s, r) => s + r.totalCents, 0)
    return { month, totalCents, perCategory }
  })
}
