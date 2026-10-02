import { describe, expect, it } from 'vitest'
import * as repQ from '@/lib/db/queries/companyReputation'
import { pruneReputationCache, REPUTATION_CACHE_DAYS } from '@/lib/db/retention/reputation'
import { runRetentionForUser } from '@/lib/db/retention/run'
import { makeCompany, makeUser } from '@/tests/factories'

const NOW = new Date('2026-10-02T03:30:00Z')
const OLD = new Date(NOW.getTime() - (REPUTATION_CACHE_DAYS + 1) * 86_400_000)
const signal = {
  id: 'gdelt-0123456789',
  source: 'gdelt' as const,
  kind: 'news' as const,
  title: 'Acme lays off 10%',
  url: 'https://n.example/a',
  date: '2026-06-01',
  category: 'layoffs' as const,
  value: null,
}

async function cached(userId: string, over: { isWatched?: boolean; fetchedAt?: Date } = {}) {
  const c = await makeCompany(userId, { isWatched: over.isWatched ?? false })
  await repQ.saveFetched(userId, c.id, { signals: [signal], sourceStatus: {}, facts: null, fetchedAt: over.fetchedAt ?? OLD })
  return c
}

describe('pruneReputationCache', () => {
  it('deletes stale cache rows of unwatched companies, keeps watched and fresh ones', async () => {
    const u = await makeUser()
    const stale = await cached(u.id)
    const watched = await cached(u.id, { isWatched: true })
    const fresh = await cached(u.id, { fetchedAt: NOW })
    expect(await pruneReputationCache(NOW)).toBe(1)
    expect(await repQ.get(u.id, stale.id)).toBeNull()
    expect((await repQ.get(u.id, watched.id))?.signals).toHaveLength(1)
    expect((await repQ.get(u.id, fresh.id))?.signals).toHaveLength(1)
  })

  it('keeps the user’s own ratings and clears only the fetched signals', async () => {
    const u = await makeUser()
    const c = await cached(u.id)
    const rating = { site: 'glassdoor' as const, rating: 3, summary: '', url: null, recordedAt: NOW.toISOString() }
    await repQ.saveRatings(u.id, c.id, [rating])
    expect(await pruneReputationCache(NOW)).toBe(1)
    const rec = await repQ.get(u.id, c.id)
    expect(rec?.signals).toEqual([])
    expect(rec?.userRatings).toEqual([rating])
    expect(await pruneReputationCache(NOW)).toBe(0)
  })

  it('runs as a registered retention step', async () => {
    const u = await makeUser()
    await cached(u.id)
    const r = await runRetentionForUser(u.id, NOW)
    expect(r.reputationCache).toBe(1)
  })
})
