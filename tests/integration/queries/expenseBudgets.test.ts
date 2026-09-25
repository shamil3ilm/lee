import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/expenseBudgets'
import { makeUser } from '@/tests/factories'

describe('expense_budgets queries', () => {
  it('upsert inserts a new row for (userId, category)', async () => {
    const u = await makeUser('bud1@x.com')
    const row = await q.upsert(u.id, {
      category: 'food',
      monthlyCapCents: 200000,
    })
    expect(row.userId).toBe(u.id)
    expect(row.category).toBe('food')
    expect(row.monthlyCapCents).toBe(200000)
    expect(row.currency).toBe('AED')
  })

  it('upsert overwrites the cap on the existing (userId, category) row', async () => {
    const u = await makeUser('bud2@x.com')
    const first = await q.upsert(u.id, {
      category: 'food',
      monthlyCapCents: 100000,
    })
    const second = await q.upsert(u.id, {
      category: 'food',
      monthlyCapCents: 250000,
      currency: 'USD',
    })
    expect(second.id).toBe(first.id)
    expect(second.monthlyCapCents).toBe(250000)
    expect(second.currency).toBe('USD')
    const all = await q.list(u.id)
    expect(all).toHaveLength(1)
  })

  it('upsert allows separate rows per category', async () => {
    const u = await makeUser('bud3@x.com')
    await q.upsert(u.id, { category: 'food', monthlyCapCents: 100 })
    await q.upsert(u.id, { category: 'transport', monthlyCapCents: 200 })
    await q.upsert(u.id, { category: 'housing', monthlyCapCents: 300 })
    const rows = await q.list(u.id)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.category)).toEqual(['food', 'housing', 'transport'])
  })

  it('list is scoped by userId', async () => {
    const u = await makeUser('bud-scope@x.com')
    const other = await makeUser('bud-scope-other@x.com')
    await q.upsert(u.id, { category: 'food', monthlyCapCents: 100 })
    expect(await q.list(other.id)).toEqual([])
  })

  it('getById returns null for missing / other-user rows', async () => {
    const u = await makeUser('bud-get@x.com')
    const row = await q.upsert(u.id, { category: 'food', monthlyCapCents: 100 })
    expect((await q.getById(u.id, row.id))?.id).toBe(row.id)
    const other = await makeUser('bud-get-other@x.com')
    expect(await q.getById(other.id, row.id)).toBeNull()
  })

  it('remove deletes only the owner row', async () => {
    const u = await makeUser('bud-rm@x.com')
    const row = await q.upsert(u.id, { category: 'food', monthlyCapCents: 100 })
    await q.remove(u.id, row.id)
    expect(await q.getById(u.id, row.id)).toBeNull()
  })
})
