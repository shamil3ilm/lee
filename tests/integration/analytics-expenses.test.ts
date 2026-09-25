import { describe, it, expect } from 'vitest'
import {
  budgetAdherenceHistory,
  budgetVsActual,
  expenseCategoryTrend,
  monthOverMonthByCategory,
  monthlyExpenses,
  topVendors,
} from '@/lib/analytics/service'
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

  it('monthOverMonthByCategory computes deltas and includes single-side categories', async () => {
    const u = await makeUser('ana-mom@x.com')
    await expensesQ.createMany(u.id, [
      // Current month
      { date: '2026-09-05', amountCents: 20000, category: 'food' },
      { date: '2026-09-10', amountCents: 5000, category: 'transport' },
      // Previous month
      { date: '2026-08-04', amountCents: 10000, category: 'food' },
      { date: '2026-08-11', amountCents: 8000, category: 'shopping' },
    ])
    const rows = await monthOverMonthByCategory(u.id, '2026-09', '2026-08')
    const byCat = Object.fromEntries(rows.map((r) => [r.category, r]))
    expect(byCat.food?.currentCents).toBe(20000)
    expect(byCat.food?.previousCents).toBe(10000)
    expect(byCat.food?.deltaCents).toBe(10000)
    expect(byCat.food?.deltaPercent).toBe(100)
    expect(byCat.transport?.previousCents).toBe(0)
    expect(byCat.transport?.currentCents).toBe(5000)
    expect(byCat.shopping?.currentCents).toBe(0)
    expect(byCat.shopping?.previousCents).toBe(8000)
    expect(byCat.shopping?.deltaCents).toBe(-8000)
  })

  it('expenseCategoryTrend returns long-format grid per (month, category)', async () => {
    const u = await makeUser('ana-trend@x.com')
    const now = new Date()
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    await expensesQ.createMany(u.id, [
      { date: `${yyyy}-${mm}-05`, amountCents: 1000, category: 'food' },
      { date: `${yyyy}-${mm}-06`, amountCents: 2000, category: 'housing' },
    ])
    const rows = await expenseCategoryTrend(u.id, 3)
    const current = rows.filter((r) => r.month === `${yyyy}-${mm}`)
    const totals = Object.fromEntries(current.map((r) => [r.category, r.totalCents]))
    expect(totals.food).toBe(1000)
    expect(totals.housing).toBe(2000)
  })

  it('topVendors collapses case-insensitively and sorts by total desc', async () => {
    const u = await makeUser('ana-vendor@x.com')
    const now = new Date()
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    await expensesQ.createMany(u.id, [
      { date: `${yyyy}-${mm}-01`, amountCents: 1000, category: 'food', vendor: 'Netflix' },
      { date: `${yyyy}-${mm}-15`, amountCents: 2000, category: 'food', vendor: 'netflix' },
      { date: `${yyyy}-${mm}-10`, amountCents: 500, category: 'transport', vendor: 'Uber' },
      { date: `${yyyy}-${mm}-11`, amountCents: 250, category: 'food' }, // null vendor → Unknown
    ])
    const rows = await topVendors(u.id, 3, 10)
    const map = Object.fromEntries(rows.map((r) => [r.vendor.toLowerCase(), r]))
    expect(map.netflix?.totalCents).toBe(3000)
    expect(map.netflix?.count).toBe(2)
    expect(map.uber?.totalCents).toBe(500)
    expect(map.unknown?.totalCents).toBe(250)
    // Descending sort by total.
    expect(rows[0]?.totalCents).toBe(3000)
  })

  it('topVendors returns [] when months < 1', async () => {
    const u = await makeUser('ana-vendor-0@x.com')
    expect(await topVendors(u.id, 0, 10)).toEqual([])
  })

  it('budgetAdherenceHistory returns cells with correct adherence classification', async () => {
    const u = await makeUser('ana-adh@x.com')
    const now = new Date()
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    await budgetsQ.upsert(u.id, { category: 'food', monthlyCapCents: 10000 })
    await budgetsQ.upsert(u.id, { category: 'transport', monthlyCapCents: 5000 })
    await expensesQ.createMany(u.id, [
      { date: `${yyyy}-${mm}-05`, amountCents: 5000, category: 'food' }, // under
      { date: `${yyyy}-${mm}-10`, amountCents: 8000, category: 'transport' }, // over
      { date: `${yyyy}-${mm}-11`, amountCents: 4000, category: 'shopping' }, // no budget → over
    ])
    const cells = await budgetAdherenceHistory(u.id, 3)
    const currentCells = cells.filter((c) => c.month === `${yyyy}-${mm}`)
    const byCat = Object.fromEntries(currentCells.map((c) => [c.category, c]))
    expect(byCat.food?.adherence).toBe('under')
    expect(byCat.food?.budgetCents).toBe(10000)
    expect(byCat.food?.spentCents).toBe(5000)
    expect(byCat.transport?.adherence).toBe('over')
    expect(byCat.shopping?.adherence).toBe('over')
    expect(byCat.shopping?.budgetCents).toBe(0)
  })
})
