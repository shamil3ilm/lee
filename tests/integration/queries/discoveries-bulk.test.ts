import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries, sources } from '@/lib/db/schema'
import * as discQ from '@/lib/db/queries/discoveries'
import { makeUser } from '@/tests/factories'

const DAY_MS = 24 * 60 * 60 * 1000

async function makeSource(userId: string) {
  const [s] = await db
    .insert(sources)
    .values({ userId, name: 'HN', kind: 'hn', config: {} })
    .returning()
  if (!s) throw new Error('failed to create source')
  return s
}

async function seedDiscovery(
  userId: string,
  sourceId: string,
  ext: string,
  createdAt: Date = new Date(),
  status: 'new' | 'saved' | 'dismissed' = 'new',
) {
  const [d] = await db
    .insert(discoveries)
    .values({
      userId,
      sourceId,
      sourceJobId: ext,
      raw: {},
      normalized: { title: ext },
      status,
      createdAt,
    })
    .returning()
  if (!d) throw new Error('seed failed')
  return d
}

describe('dismissByIds', () => {
  it('returns 0 on empty ids', async () => {
    const u = await makeUser('bulk-empty@x.com')
    const n = await discQ.dismissByIds(u.id, [])
    expect(n).toBe(0)
  })

  it('marks only the given rows as dismissed and only when status=new', async () => {
    const u = await makeUser('bulk-a@x.com')
    const src = await makeSource(u.id)
    const d1 = await seedDiscovery(u.id, src.id, 'j1')
    const d2 = await seedDiscovery(u.id, src.id, 'j2')
    const d3 = await seedDiscovery(u.id, src.id, 'j3', new Date(), 'saved')

    const n = await discQ.dismissByIds(u.id, [d1.id, d2.id, d3.id])
    expect(n).toBe(2)

    const after1 = await db.query.discoveries.findFirst({
      where: eq(discoveries.id, d1.id),
    })
    const after3 = await db.query.discoveries.findFirst({
      where: eq(discoveries.id, d3.id),
    })
    expect(after1?.status).toBe('dismissed')
    expect(after3?.status).toBe('saved')
  })

  it('scopes strictly by userId', async () => {
    const u1 = await makeUser('bulk-scope-1@x.com')
    const u2 = await makeUser('bulk-scope-2@x.com')
    const src2 = await makeSource(u2.id)
    const d2 = await seedDiscovery(u2.id, src2.id, 'x')

    const n = await discQ.dismissByIds(u1.id, [d2.id])
    expect(n).toBe(0)

    const after = await db.query.discoveries.findFirst({
      where: and(eq(discoveries.id, d2.id), eq(discoveries.userId, u2.id)),
    })
    expect(after?.status).toBe('new')
  })
})

describe('dismissOlderThan', () => {
  it('dismisses only rows older than the cutoff', async () => {
    const u = await makeUser('older-a@x.com')
    const src = await makeSource(u.id)
    // 10 days old — should be dismissed
    const old = await seedDiscovery(
      u.id,
      src.id,
      'old',
      new Date(Date.now() - 10 * DAY_MS),
    )
    // 3 days old — should stay
    const recent = await seedDiscovery(
      u.id,
      src.id,
      'recent',
      new Date(Date.now() - 3 * DAY_MS),
    )

    const n = await discQ.dismissOlderThan(u.id, 7)
    expect(n).toBe(1)

    const rows = await db.query.discoveries.findMany({
      where: eq(discoveries.userId, u.id),
    })
    const map = new Map(rows.map((r) => [r.id, r.status] as const))
    expect(map.get(old.id)).toBe('dismissed')
    expect(map.get(recent.id)).toBe('new')
  })
})
