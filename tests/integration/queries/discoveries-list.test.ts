import { describe, it, expect } from 'vitest'
import * as discQ from '@/lib/db/queries/discoveries'
import { makeDiscovery, makeSource, makeUser } from '@/tests/factories'

const normalized = (i: number) => ({
  kind: 'job',
  title: `Engineer ${i}`,
  companyName: 'Acme',
  location: 'Dubai',
  remoteType: 'remote',
  techStack: ['ts', 'pg'],
  applyUrl: `https://acme.test/${i}`,
  descriptionMd: 'x'.repeat(5_000),
  raw: { huge: 'y'.repeat(5_000) },
})

describe('discoveries.list (lean inbox rows)', () => {
  it('returns only the render fields, never raw / normalized payloads', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    await makeDiscovery(u.id, src.id, {
      normalized: normalized(1),
      raw: { huge: 'z'.repeat(5_000) },
      matchScore: 80,
      benefitsScore: 60,
      matchReasoning: { summary: 'good' },
    })
    const [row] = await discQ.list(u.id, { status: 'new' })
    expect(row).toMatchObject({
      title: 'Engineer 1',
      companyName: 'Acme',
      location: 'Dubai',
      remoteType: 'remote',
      techStack: ['ts', 'pg'],
      applyUrl: 'https://acme.test/1',
      matchScore: 80,
      benefitsScore: 60,
      matchReasoning: { summary: 'good' },
      status: 'new',
    })
    expect(row).not.toHaveProperty('raw')
    expect(row).not.toHaveProperty('normalized')
    expect(JSON.stringify(row).length).toBeLessThan(1_000)
  })

  it('tolerates rows with missing normalized fields', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    await makeDiscovery(u.id, src.id, { normalized: {} })
    const [row] = await discQ.list(u.id)
    expect(row).toMatchObject({ title: null, companyName: null, techStack: [], applyUrl: null })
  })

  it('pages with limit + offset in a stable order, including the dismissed tab', async () => {
    const u = await makeUser()
    const src = await makeSource(u.id)
    for (let i = 0; i < 5; i++) {
      await makeDiscovery(u.id, src.id, {
        normalized: normalized(i),
        status: 'dismissed',
        matchScore: 50 + i,
      })
    }
    await makeDiscovery(u.id, src.id, { normalized: normalized(99), status: 'new' })
    const p1 = await discQ.list(u.id, { status: 'dismissed', sort: 'match', limit: 2, offset: 0 })
    const p2 = await discQ.list(u.id, { status: 'dismissed', sort: 'match', limit: 2, offset: 2 })
    const p3 = await discQ.list(u.id, { status: 'dismissed', sort: 'match', limit: 2, offset: 4 })
    expect(p1.map((r) => r.matchScore)).toEqual([54, 53])
    expect(p2.map((r) => r.matchScore)).toEqual([52, 51])
    expect(p3.map((r) => r.matchScore)).toEqual([50])
  })
})
