/**
 * Category enum + guard extracted into a client-safe module so client
 * components (forms, filter chips) can import it without pulling in the
 * Drizzle/postgres client-side.
 *
 * Order matters — new categories should be APPENDED, not inserted. UI
 * consumers (select dropdowns, category card grids) render this array
 * directly and users get muscle memory around the ordering.
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
