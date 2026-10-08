import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs, radarEntries, radarItems } from '@/lib/db/schema'
import * as itemsQ from '@/lib/db/queries/radarItems'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { saveProfile } from '@/lib/profile/service'
import { ingestItems } from '@/lib/radar/ingest'
import { runRadarSource } from '@/lib/radar/run'
import { radarSourcesByUser } from '@/lib/radar/schedule'
import type { RadarItemInput } from '@/lib/radar/types'
import { addTerm, removeTerm, setTermMuted, RadarError } from '@/lib/radar/watch'
import { scheduleUserToday } from '@/lib/queue/scheduler'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { fixtureFetch } from '@/tests/fixtures/reputation/fetch'
import { radarRoutes } from '@/tests/fixtures/radar/fetch'
import { makeUser } from '@/tests/factories'

const NOW = new Date('2026-10-08T09:00:00Z')

function item(over: Partial<RadarItemInput>): RadarItemInput {
  return {
    source: 'hn',
    externalId: 'x',
    kind: 'news',
    title: 'A story',
    url: 'https://news.ycombinator.com/item?id=1',
    publishedAt: new Date('2026-10-05T00:00:00Z'),
    excerpt: '',
    metrics: {},
    ...over,
  }
}

async function entries(userId: string) {
  return db.select().from(radarEntries).where(eq(radarEntries.userId, userId))
}

describe('radar ingest', () => {
  it('dedups on (source, external id) across runs and within a run', async () => {
    const u = await makeUser()
    const a = item({ externalId: '1' })
    const first = await ingestItems(u.id, [a, a, item({ externalId: '2', url: 'https://news.ycombinator.com/item?id=2' })], [], NOW)
    expect(first).toEqual({ fetched: 2, new: 2, matched: 0 })
    const again = await ingestItems(u.id, [a], [], NOW)
    expect(again).toEqual({ fetched: 1, new: 0, matched: 0 })
    expect(await db.select().from(radarItems).where(eq(radarItems.userId, u.id))).toHaveLength(2)
  })

  it('clusters a repo, a paper linking it and a story linking it into one entry', async () => {
    const u = await makeUser()
    await ingestItems(
      u.id,
      [
        item({ source: 'github', externalId: '101', kind: 'repo', title: 'acme-lab/zorb', url: 'https://github.com/acme-lab/zorb', metrics: { repoId: 'acme-lab/zorb', createdAt: '2026-10-03' } }),
        item({ source: 'hf_papers', externalId: '2601.00001', kind: 'paper', title: 'Zorb paper', url: 'https://huggingface.co/papers/2601.00001', metrics: { arxivId: '2601.00001', links: ['https://github.com/acme-lab/zorb'] } }),
        item({ source: 'arxiv', externalId: '2601.00001', kind: 'paper', title: 'Zorb paper', url: 'https://arxiv.org/abs/2601.00001', metrics: { arxivId: '2601.00001' } }),
        item({ source: 'hn', externalId: '9001', title: 'Show HN: zorb', metrics: { links: ['https://github.com/acme-lab/zorb/tree/main'] } }),
      ],
      [],
      NOW,
    )
    const rows = await entries(u.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'zorb', kind: 'repo', itemCount: 4 })
    expect([...rows[0]!.sources].sort()).toEqual(['arxiv', 'github', 'hf_papers', 'hn'])
  })

  it('matches watch terms and groups single-term news under the term', async () => {
    const u = await makeUser()
    const t = await termsQ.insert(u.id, { term: 'Zorb', aliases: [], kind: 'entity' })
    const terms = await termsQ.list(u.id)
    const r = await ingestItems(
      u.id,
      [
        item({ source: 'gdelt', externalId: 'g1', title: 'Acme launches Zorb', url: 'https://news.example.com/a' }),
        item({ source: 'hn', externalId: 'h1', title: 'Zorb benchmarks', url: 'https://news.ycombinator.com/item?id=5' }),
        item({ source: 'feeds', externalId: 'f1', kind: 'product', title: 'Unrelated launch', url: 'https://lab.example.com/news/x' }),
      ],
      terms,
      NOW,
    )
    expect(r).toEqual({ fetched: 3, new: 3, matched: 2 })
    const rows = await entries(u.id)
    const watched = rows.find((e) => e.matchedTerms.length > 0)
    expect(watched).toMatchObject({ name: 'Zorb', itemCount: 2, matchedTerms: [t!.id] })
    expect(rows).toHaveLength(2)
    expect(await itemsQ.countNewWatched(u.id)).toBe(1)
  })

  it('a new item on a read entry makes it new again', async () => {
    const u = await makeUser()
    await ingestItems(u.id, [item({ externalId: '1', metrics: { links: ['https://x.example.com/p/1'] } })], [], NOW)
    const [e] = await entries(u.id)
    await itemsQ.setEntryFlags(u.id, e!.id, { readAt: NOW })
    await ingestItems(u.id, [item({ externalId: '2', source: 'gdelt', url: 'https://x.example.com/p/1' })], [], NOW)
    const [after] = await entries(u.id)
    expect(after?.readAt).toBeNull()
    expect(after?.itemCount).toBe(2)
  })
})

describe('watchlist', () => {
  it('adds, mutes and removes terms and re-matches stored items', async () => {
    const u = await makeUser()
    await ingestItems(u.id, [item({ externalId: '1', title: 'Quill-Runner 2 is out' })], [], NOW)
    expect(await itemsQ.countNewWatched(u.id)).toBe(0)
    const t = await addTerm(u.id, { term: '  Quill   Runner ', aliases: ['QR2', 'quill runner'] })
    expect(t).toMatchObject({ term: 'Quill Runner', aliases: ['QR2'] })
    expect(await itemsQ.countNewWatched(u.id)).toBe(1)
    await setTermMuted(u.id, t.id, true)
    expect(await itemsQ.countNewWatched(u.id)).toBe(0)
    await setTermMuted(u.id, t.id, false)
    expect(await itemsQ.countNewWatched(u.id)).toBe(1)
    await removeTerm(u.id, t.id)
    expect(await itemsQ.countNewWatched(u.id)).toBe(0)
  })

  it('rejects duplicates (any case) and invalid terms', async () => {
    const u = await makeUser()
    await addTerm(u.id, { term: 'Zorb' })
    await expect(addTerm(u.id, { term: 'zorb' })).rejects.toBeInstanceOf(RadarError)
    await expect(addTerm(u.id, { term: 'x' })).rejects.toThrow('2 to 80')
  })
})

describe('radar source runs', () => {
  it('fetches, ingests and summarises a source', async () => {
    const u = await makeUser()
    await termsQ.insert(u.id, { term: 'Zorb', aliases: [], kind: 'term' })
    const fetchImpl = fixtureFetch(radarRoutes())
    const s = await runRadarSource(u.id, 'hf', { fetchImpl, limiter: NO_WAIT, now: NOW })
    expect(s).toMatchObject({ kind: 'radar-source', source: 'hf', status: 'polled', fetched: 4, new: 4, matched: 3 })
    const again = await runRadarSource(u.id, 'hf', { fetchImpl, limiter: NO_WAIT, now: NOW })
    expect(again).toMatchObject({ status: 'polled', fetched: 4, new: 0 })
  })

  it('records a failure in the summary instead of throwing', async () => {
    const u = await makeUser()
    await termsQ.insert(u.id, { term: 'Zorb', aliases: [], kind: 'term' })
    const fetchImpl = fixtureFetch([{ match: () => true, status: 429, body: {} }])
    const s = await runRadarSource(u.id, 'hf_papers', { fetchImpl, limiter: NO_WAIT, now: NOW })
    expect(s).toMatchObject({ status: 'failed', error: 'hf papers: rate limited (429)' })
  })

  it('skips switched-off sources and term sources without terms', async () => {
    const u = await makeUser()
    await saveProfile(u.id, { radarSourcesOff: ['arxiv'] })
    expect((await runRadarSource(u.id, 'arxiv')).status).toBe('off')
    expect((await runRadarSource(u.id, 'hn')).status).toBe('skipped')
  })

  it('plans radar jobs only for users who watch a term, minus switched-off sources', async () => {
    const u = await makeUser()
    expect((await radarSourcesByUser(u.id)).get(u.id)).toBeUndefined()
    await termsQ.insert(u.id, { term: 'Zorb', aliases: [], kind: 'term' })
    await saveProfile(u.id, { radarSourcesOff: ['gdelt'] })
    await scheduleUserToday(u.id, NOW)
    const jobs = await db.select().from(queueJobs).where(eq(queueJobs.userId, u.id))
    const radar = jobs.filter((j) => j.type === JOB_TYPES.radarSource).map((j) => (j.payload as { source: string }).source)
    expect(radar.sort()).toEqual(['arxiv', 'feeds', 'github', 'hf', 'hf_papers', 'hn'])
  })
})
