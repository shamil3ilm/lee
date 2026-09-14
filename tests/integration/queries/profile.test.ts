import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/profile'
import { makeUser } from '@/tests/factories'

describe('user_profile queries', () => {
  it('get returns null when no profile exists', async () => {
    const u = await makeUser()
    const row = await q.get(u.id)
    expect(row).toBeNull()
  })

  it('upsert inserts on first call', async () => {
    const u = await makeUser()
    const row = await q.upsert(u.id, {
      headline: 'Senior Engineer',
      skills: ['ts', 'go'],
      seniority: 'senior',
    })
    expect(row.userId).toBe(u.id)
    expect(row.headline).toBe('Senior Engineer')
    expect(row.skills).toEqual(['ts', 'go'])
    const back = await q.get(u.id)
    expect(back?.id).toBe(row.id)
  })

  it('upsert updates existing row and preserves userId scoping', async () => {
    const u = await makeUser()
    const first = await q.upsert(u.id, { headline: 'A', seniority: 'mid' })
    const second = await q.upsert(u.id, { headline: 'B' })
    expect(second.id).toBe(first.id)
    expect(second.headline).toBe('B')
    // patch does NOT null out unsupplied columns
    expect(second.seniority).toBe('mid')
  })

  it('upsert creates independent rows per user', async () => {
    const u1 = await makeUser('p1@x.com')
    const u2 = await makeUser('p2@x.com')
    await q.upsert(u1.id, { headline: 'one' })
    await q.upsert(u2.id, { headline: 'two' })
    const r1 = await q.get(u1.id)
    const r2 = await q.get(u2.id)
    expect(r1?.headline).toBe('one')
    expect(r2?.headline).toBe('two')
    expect(r1?.id).not.toBe(r2?.id)
  })
})
