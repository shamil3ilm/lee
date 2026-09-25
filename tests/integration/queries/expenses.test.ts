import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/expenses'
import { makeUser } from '@/tests/factories'

describe('expenses queries', () => {
  it('create inserts and scopes by userId', async () => {
    const u = await makeUser('exp1@x.com')
    const row = await q.create(u.id, {
      date: '2026-09-15',
      amountCents: 4999,
      currency: 'AED',
      category: 'subscription',
      vendor: 'Netflix',
    })
    expect(row.userId).toBe(u.id)
    expect(row.amountCents).toBe(4999)
    expect(row.category).toBe('subscription')
    expect(row.recurring).toBe(false)
  })

  it('createMany batch inserts and returns rows', async () => {
    const u = await makeUser('exp-many@x.com')
    const inserted = await q.createMany(u.id, [
      { date: '2026-09-10', amountCents: 100, category: 'food' },
      { date: '2026-09-11', amountCents: 200, category: 'transport' },
      { date: '2026-09-12', amountCents: 300, category: 'shopping' },
    ])
    expect(inserted).toHaveLength(3)
    const all = await q.list(u.id)
    expect(all).toHaveLength(3)
  })

  it('createMany with empty array is a no-op', async () => {
    const u = await makeUser('exp-many-empty@x.com')
    const rows = await q.createMany(u.id, [])
    expect(rows).toEqual([])
  })

  it('list returns expenses in reverse-date order', async () => {
    const u = await makeUser('exp-list@x.com')
    await q.create(u.id, { date: '2026-09-01', amountCents: 100, category: 'food' })
    await q.create(u.id, { date: '2026-09-15', amountCents: 200, category: 'food' })
    await q.create(u.id, { date: '2026-09-10', amountCents: 300, category: 'food' })
    const rows = await q.list(u.id)
    expect(rows.map((r) => r.date)).toEqual(['2026-09-15', '2026-09-10', '2026-09-01'])
  })

  it('list is scoped by userId', async () => {
    const u = await makeUser('exp-scope@x.com')
    const other = await makeUser('other-exp@x.com')
    await q.create(u.id, { date: '2026-09-01', amountCents: 100, category: 'food' })
    expect(await q.list(other.id)).toHaveLength(0)
  })

  it('listMonth filters by YYYY-MM prefix', async () => {
    const u = await makeUser('exp-month@x.com')
    await q.create(u.id, { date: '2026-08-31', amountCents: 100, category: 'food' })
    await q.create(u.id, { date: '2026-09-01', amountCents: 200, category: 'food' })
    await q.create(u.id, { date: '2026-09-30', amountCents: 300, category: 'food' })
    await q.create(u.id, { date: '2026-10-01', amountCents: 400, category: 'food' })
    const rows = await q.listMonth(u.id, '2026-09')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.amountCents).sort()).toEqual([200, 300])
  })

  it('getById returns null for missing / other-user rows', async () => {
    const u = await makeUser('exp-get@x.com')
    const row = await q.create(u.id, {
      date: '2026-09-15',
      amountCents: 100,
      category: 'food',
    })
    expect((await q.getById(u.id, row.id))?.id).toBe(row.id)
    const other = await makeUser('exp-get-other@x.com')
    expect(await q.getById(other.id, row.id)).toBeNull()
    expect(await q.getById(u.id, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('update patches fields and refreshes updatedAt', async () => {
    const u = await makeUser('exp-upd@x.com')
    const row = await q.create(u.id, {
      date: '2026-09-15',
      amountCents: 100,
      category: 'food',
    })
    const updated = await q.update(u.id, row.id, { amountCents: 250, vendor: 'Carrefour' })
    expect(updated?.amountCents).toBe(250)
    expect(updated?.vendor).toBe('Carrefour')
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime())
  })

  it('update returns null for missing / other-user rows', async () => {
    const u = await makeUser('exp-upd2@x.com')
    const row = await q.create(u.id, {
      date: '2026-09-15',
      amountCents: 100,
      category: 'food',
    })
    const other = await makeUser('exp-upd2-other@x.com')
    expect(await q.update(other.id, row.id, { amountCents: 999 })).toBeNull()
  })

  it('remove deletes only the owner row', async () => {
    const u = await makeUser('exp-rm@x.com')
    const row = await q.create(u.id, {
      date: '2026-09-15',
      amountCents: 100,
      category: 'food',
    })
    await q.remove(u.id, row.id)
    expect(await q.getById(u.id, row.id)).toBeNull()
  })

  it('sumByCategory aggregates and sorts by total desc', async () => {
    const u = await makeUser('exp-sumcat@x.com')
    await q.createMany(u.id, [
      { date: '2026-09-01', amountCents: 100, category: 'food' },
      { date: '2026-09-02', amountCents: 200, category: 'food' },
      { date: '2026-09-03', amountCents: 500, category: 'housing' },
      { date: '2026-09-04', amountCents: 50, category: 'transport' },
      // Different month — excluded
      { date: '2026-08-15', amountCents: 999, category: 'food' },
    ])
    const rows = await q.sumByCategory(u.id, '2026-09')
    expect(rows).toEqual([
      { category: 'housing', totalCents: 500, count: 1 },
      { category: 'food', totalCents: 300, count: 2 },
      { category: 'transport', totalCents: 50, count: 1 },
    ])
  })

  it('sumByMonth returns every month in the window even when empty', async () => {
    const u = await makeUser('exp-summonth@x.com')
    const now = new Date()
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    await q.create(u.id, {
      date: `${yyyy}-${mm}-05`,
      amountCents: 750,
      category: 'shopping',
    })
    const rows = await q.sumByMonth(u.id, 3)
    expect(rows).toHaveLength(3)
    const current = rows[rows.length - 1]!
    expect(current.month).toBe(`${yyyy}-${mm}`)
    expect(current.totalCents).toBe(750)
    expect(current.perCategory).toEqual([{ category: 'shopping', totalCents: 750 }])
  })

  it('sumByMonth returns [] when months < 1', async () => {
    const u = await makeUser('exp-summ0@x.com')
    expect(await q.sumByMonth(u.id, 0)).toEqual([])
  })

  it('isExpenseCategory recognises known values', () => {
    expect(q.isExpenseCategory('food')).toBe(true)
    expect(q.isExpenseCategory('subscription')).toBe(true)
    expect(q.isExpenseCategory('bogus')).toBe(false)
  })
})
