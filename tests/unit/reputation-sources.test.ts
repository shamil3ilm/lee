import { describe, expect, it } from 'vitest'
import { fetchHackerNews } from '@/lib/reputation/sources/hn'
import { buildGdeltUrl, fetchGdeltNews, gdeltDay } from '@/lib/reputation/sources/gdelt'
import { fetchWikidataFacts } from '@/lib/reputation/sources/wikidata'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { SourceHttpError } from '@/lib/reputation/http'
import { allSourceRoutes, fixture, fixtureFetch } from '@/tests/fixtures/reputation/fetch'

const ACME = { name: 'Acme Payments LLC', domain: 'acmepay.com' }
const NOW = new Date('2026-09-27T00:00:00Z')

function deps(routes = allSourceRoutes()) {
  const fetchImpl = fixtureFetch(routes)
  return { fetchImpl, limiter: NO_WAIT, now: NOW }
}

describe('fetchHackerNews', () => {
  it('keeps stories naming the company or linking its domain', async () => {
    const d = deps()
    const { signals } = await fetchHackerNews(ACME, d)
    const mentions = signals.filter((s) => s.kind === 'hn_mention')
    expect(mentions.map((m) => m.title)).toEqual([
      'Acme Payments open-sources its ledger',
      'Show HN: A new way to reconcile payments',
    ])
    expect(mentions[0]).toMatchObject({
      url: 'https://news.ycombinator.com/item?id=41000001',
      date: '2026-05-02',
      value: 312,
      source: 'hn',
    })
    expect(d.fetchImpl.calls[0]).toContain('query=%22acme%20payments%22')
  })

  it('summarises "Who is hiring" history by month from header lines only', async () => {
    const { signals } = await fetchHackerNews(ACME, deps())
    const hiring = signals.find((s) => s.kind === 'hn_hiring')
    expect(hiring).toMatchObject({
      title: 'Posted in 2 "Who is hiring" threads, latest Sep 2026',
      url: 'https://news.ycombinator.com/item?id=42000001',
      date: '2026-09-02',
      value: 2,
    })
  })

  it('surfaces an HTTP failure for the caller to record', async () => {
    const d = deps([{ match: () => true, status: 503, body: 'down' }])
    await expect(fetchHackerNews(ACME, d)).rejects.toBeInstanceOf(SourceHttpError)
  })
})

describe('fetchGdeltNews', () => {
  it('builds one bounded query for the last 3 months', () => {
    const url = new URL(buildGdeltUrl(ACME))
    expect(url.searchParams.get('query')).toMatch(/^"acme payments" \(layoff OR/)
    expect(url.searchParams.get('timespan')).toBe('3months')
    expect(url.searchParams.get('format')).toBe('json')
  })

  it('classifies headlines, drops syndicated copies, unrelated and unsafe links', async () => {
    const { signals } = await fetchGdeltNews(ACME, deps())
    expect(signals.map((s) => [s.category, s.date])).toEqual([
      ['wage_theft', '2026-09-10'],
      ['layoffs', '2026-08-01'],
      ['funding', '2026-07-05'],
    ])
    expect(signals.every((s) => s.url.startsWith('https://'))).toBe(true)
  })

  it('treats an empty body as no news, and a 429 as an error', async () => {
    await expect(fetchGdeltNews(ACME, deps([{ match: () => true, body: '' }]))).resolves.toEqual({ signals: [] })
    await expect(fetchGdeltNews(ACME, deps([{ match: () => true, status: 429, body: 'slow' }]))).rejects.toThrow(
      'gdelt: rate limited (429)',
    )
  })

  it('gdeltDay parses seendate', () => {
    expect(gdeltDay('20260910T081500Z')).toBe('2026-09-10')
    expect(gdeltDay(undefined)).toBeNull()
  })
})

describe('fetchWikidataFacts', () => {
  it('picks the entity whose official website is on the company domain', async () => {
    const { facts } = await fetchWikidataFacts(ACME, deps())
    expect(facts).toEqual({
      wikidataId: 'Q900002',
      label: 'Acme Payments',
      description: 'payments company based in Dubai',
      founded: '2011-03-01',
      headquarters: 'Dubai',
      industry: 'financial services',
      employees: 1450,
      website: 'https://www.acmepay.com',
      wikipediaUrl: 'https://en.wikipedia.org/wiki/Acme_Payments',
    })
  })

  it('without a domain, accepts only an exact label described as a business', async () => {
    const { facts } = await fetchWikidataFacts({ name: 'Acme Payments', domain: null }, deps())
    expect(facts?.wikidataId).toBe('Q900002')
  })

  it('returns facts: null when nothing matches confidently', async () => {
    const d = deps([
      {
        match: (u) => u.searchParams.get('action') === 'wbsearchentities',
        body: { search: [{ id: 'Q900001' }] },
      },
      { match: () => true, body: { entities: { Q900001: (fixture('wikidata-entities.json') as { entities: Record<string, unknown> }).entities.Q900001 } } },
    ])
    await expect(fetchWikidataFacts({ name: 'Acme Payments', domain: 'other.com' }, d)).resolves.toEqual({
      signals: [],
      facts: null,
    })
  })

  it('returns facts: null with no search hits, without further calls', async () => {
    const d = deps([{ match: () => true, body: { search: [] } }])
    await expect(fetchWikidataFacts(ACME, d)).resolves.toEqual({ signals: [], facts: null })
    expect(d.fetchImpl.calls).toHaveLength(1)
  })
})
