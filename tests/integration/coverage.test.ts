import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { sources } from '@/lib/db/schema'
import { regionActivity } from '@/lib/db/queries/coverage'
import { enableRegionBoards } from '@/lib/coverage/enable'
import { catalogBoardsFor } from '@/lib/coverage/compute'
import { getPlaybook } from '@/lib/coverage/playbooks'
import { sourceIdentity } from '@/lib/defaults/catalog'
import { makeFreshUser, makeDiscovery, makeSource } from '@/tests/factories'

describe('coverage: region activity', () => {
  it('counts recent postings by status and the sources that yielded the region (ancestors stored)', async () => {
    const u = await makeFreshUser()
    const a = await makeSource(u.id, { kind: 'rss', name: 'A' })
    const b = await makeSource(u.id, { kind: 'rss', name: 'B' })
    const now = new Date('2026-10-09T12:00:00Z')
    const recent = new Date('2026-10-07T12:00:00Z')
    const old = new Date('2026-09-01T12:00:00Z')
    await makeDiscovery(u.id, a.id, { regionIds: ['salmiya', 'kw', 'gcc'], status: 'new', createdAt: recent })
    await makeDiscovery(u.id, a.id, { regionIds: ['kw', 'gcc'], status: 'filtered', createdAt: recent })
    await makeDiscovery(u.id, b.id, { regionIds: ['kuwait-city', 'kw', 'gcc'], status: 'shortlisted', createdAt: new Date('2026-09-20T12:00:00Z') })
    await makeDiscovery(u.id, b.id, { regionIds: ['kw', 'gcc'], status: 'new', createdAt: old })
    await makeDiscovery(u.id, b.id, { regionIds: ['dubai', 'ae', 'gcc'], status: 'new', createdAt: recent })

    const m = await regionActivity(u.id, ['kw', 'ae', 'om'], 7, now)
    expect(m.get('kw')).toEqual({ byStatus: { new: 1, filtered: 1 }, companies: 0, yieldingSources: 2 })
    expect(m.get('ae')!.byStatus).toEqual({ new: 1 })
    expect(m.get('om')).toEqual({ byStatus: {}, companies: 0, yieldingSources: 0 })
  })
})

describe('coverage: turn on a region\'s boards', () => {
  it('switches on the catalog boards the user has off and adds the missing ones, once', async () => {
    const u = await makeFreshUser()
    const kw = getPlaybook('kw')!
    const boards = catalogBoardsFor(kw)
    const [first] = boards
    await makeSource(u.id, { kind: first!.kind, name: first!.name, config: first!.config, enabled: false })

    const r = await enableRegionBoards(u.id, 'kw')
    expect(r).toMatchObject({ enabled: 1, added: boards.length - 1 })
    const rows = await db.select().from(sources).where(eq(sources.userId, u.id))
    const on = new Set(rows.filter((s) => s.enabled).map((s) => sourceIdentity(s.kind, s.config as Record<string, unknown>)))
    for (const d of boards) expect(on.has(sourceIdentity(d.kind, d.config)), d.key).toBe(true)

    const again = await enableRegionBoards(u.id, 'kw')
    expect(again).toMatchObject({ enabled: 0, added: 0 })
    expect(await enableRegionBoards(u.id, 'atlantis')).toBeNull()
  })
})
