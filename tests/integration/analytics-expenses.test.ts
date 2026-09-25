import { describe, it, expect } from 'vitest'
import { budgetVsActual, monthlyExpenses } from '@/lib/analytics/service'
import * as expensesQ from '@/lib/db/queries/expenses'
import * as budgetsQ from '@/lib/db/queries/expenseBudgets'
import { makeUser } from '@/tests/factories'

describe('analytics expense extensions', () => {
  it('monthlyExpenses aggregates per (month, category)', async () => {
    const u = await makeUser('ana-me@x.com')
    const now = new Date()
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    await expensesQ.createMany(u.id, [
      { date: `${yyyy}-${mm}-05`, amountCents: 500, category: 'food' },
      { date: `${yyyy}-${mm}-07`, amountCents: 1500, category: 'food' },
      { date: `${yyyy}-${mm}-09`, amountCents: 800, category: 'housing' },
    ])
    const bars = await monthlyExpenses(u.id, 3)
    expect(bars).toHaveLength(3)
    const current = bars[bars.length - 1]!
    expect(current.month).toBe(`${yyyy}-${mm}`)
    expect(current.totalCents).toBe(2800)
    const food = current.perCategory.find((c) => c.category === 'food')
    expect(food?.totalCents).toBe(2000)
  })

  it('budgetVsActual merges caps and actuals', async () => {
    const u = await makeUser('ana-bva@x.com')
    const now = new Date()
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    await budgetsQ.upsert(u.id, { category: 'food', monthlyCapCents: 100000 })
    await budgetsQ.upsert(u.id, { category: 'transport', monthlyCapCents: 20000 })
    await expensesQ.createMany(u.id, [
      // spend that stays under the cap
      { date: `${yyyy}-${mm}-05`, amountCents: 5000, category: 'food' },
      // no budget for shopping — should still appear
      { date: `${yyyy}-${mm}-06`, amountCents: 3000, category: 'shopping' },
    ])
    const rows = await budgetVsActual(u.id)
    const byCat = Object.fromEntries(rows.map((r) => [r.category, r]))
    expect(byCat.food?.budgetCents).toBe(100000)
    expect(byCat.food?.actualCents).toBe(5000)
    expect(byCat.transport?.budgetCents).toBe(20000)
    expect(byCat.transport?.actualCents).toBe(0)
    expect(byCat.shopping?.budgetCents).toBe(0)
    expect(byCat.shopping?.actualCents).toBe(3000)
  })

  it('budgetVsActual accepts explicit month', async () => {
    const u = await makeUser('ana-bva2@x.com')
    await budgetsQ.upsert(u.id, { category: 'food', monthlyCapCents: 100000 })
    await expensesQ.create(u.id, {
      date: '2025-01-15',
      amountCents: 4200,
      category: 'food',
    })
    const rows = await budgetVsActual(u.id, '2025-01')
    expect(rows.find((r) => r.category === 'food')?.actualCents).toBe(4200)
  })
})
