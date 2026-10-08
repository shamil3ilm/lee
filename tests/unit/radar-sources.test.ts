import { describe, expect, it } from 'vitest'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { REPUTATION_USER_AGENT } from '@/lib/reputation/http'
import { arxivQueryUrl, fetchArxiv, toArxivItems } from '@/lib/radar/sources/arxiv'
import { fetchOfficialFeeds, toFeedItems } from '@/lib/radar/sources/feeds'
import { fetchGdeltTerms, gdeltTermUrl, toGdeltItems } from '@/lib/radar/sources/gdelt'
import { fetchGithub, termQuery, toRepoItems, topicQuery } from '@/lib/radar/sources/github'
import { fetchHfHub, fetchHfPapers, toDatasetItems, toModelItems, toPaperItems, toSpaceItems } from '@/lib/radar/sources/hf'
import { fetchHnTerms, hnTermUrl, toHnItems } from '@/lib/radar/sources/hn'
import { termsForRun } from '@/lib/radar/sources/types'
import { fixtureFetch } from '@/tests/fixtures/reputation/fetch'
import { radarJson, radarRoutes, radarText } from '@/tests/fixtures/radar/fetch'

const NOW = new Date('2026-10-08T09:00:00Z')
const TERM = { id: 't1', term: 'Zorb', aliases: [] as string[] }
const feed = { id: 'example-lab', org: 'Example', label: 'Example Lab', url: 'https://lab.example.com/feed.xml' }

describe('Hugging Face parsers', () => {
  it('maps trending models with metrics and the arXiv tag', () => {
    const items = toModelItems(radarJson('hf-models.json'))
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      source: 'hf',
      externalId: 'model:acme-lab/Zorb-7B',
      kind: 'model',
      title: 'acme-lab/Zorb-7B',
      url: 'https://huggingface.co/acme-lab/Zorb-7B',
      metrics: { likes: 120, downloads: 4500, createdAt: '2026-10-01', repoId: 'acme-lab/Zorb-7B', arxivId: '2601.00001' },
    })
    expect(items[0]?.excerpt).toBe('text-generation · transformers · license apache-2.0')
  })

  it('maps Spaces, datasets (no email addresses) and daily papers', () => {
    const misc = radarJson<{ spaces: unknown; datasets: unknown; papers: unknown }>('hf-misc.json')
    expect(toSpaceItems(misc.spaces)[0]).toMatchObject({ kind: 'product', url: 'https://huggingface.co/spaces/acme-lab/zorb-demo' })
    const ds = toDatasetItems(misc.datasets)[0]
    expect(ds?.kind).toBe('dataset')
    expect(ds?.excerpt).not.toContain('@')
    const papers = toPaperItems(misc.papers)
    expect(papers).toHaveLength(1)
    expect(papers[0]).toMatchObject({
      source: 'hf_papers',
      externalId: '2601.00001',
      kind: 'paper',
      url: 'https://huggingface.co/papers/2601.00001',
      metrics: { arxivId: '2601.00001', upvotes: 12, links: ['https://github.com/acme-lab/zorb', 'https://zorb.example.org/'] },
    })
  })

  it('ignores malformed bodies', () => {
    expect(toModelItems({ error: 'x' })).toEqual([])
    expect(toPaperItems(null)).toEqual([])
  })

  it('fetches with the honest User-Agent and keeps going when one list fails', async () => {
    const routes = radarRoutes().map((r, i) => (i === 1 ? { ...r, status: 500 } : r))
    const fetchImpl = fixtureFetch(routes)
    const r = await fetchHfHub({ fetchImpl, limiter: NO_WAIT })
    expect(r.items.map((i) => i.kind)).toEqual(['model', 'model', 'dataset'])
    expect(r.partialErrors).toEqual(['hf spaces: HTTP 500'])
    expect(fetchImpl.agents.every((a) => a === REPUTATION_USER_AGENT)).toBe(true)
    expect((await fetchHfPapers({ fetchImpl, limiter: NO_WAIT })).items).toHaveLength(1)
  })
})

describe('GitHub parser', () => {
  it('maps repos and skips forks', () => {
    const items = toRepoItems(radarJson('github-search.json'))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      source: 'github',
      externalId: '101',
      kind: 'repo',
      title: 'acme-lab/zorb',
      metrics: { stars: 321, createdAt: '2026-10-03', repoId: 'acme-lab/zorb' },
    })
    expect(items[0]?.excerpt).toBe('Zorb inference server — Topics: llm, inference')
  })

  it('builds rising-topic and term queries', () => {
    expect(decodeURIComponent(topicQuery('llm', NOW))).toContain('topic:llm created:>2026-10-01')
    expect(decodeURIComponent(termQuery('Quill "Runner"', NOW))).toContain('"Quill Runner" in:name,description pushed:>2026-09-08')
  })

  it('searches three topics plus watch terms, with an optional token', async () => {
    const fetchImpl = fixtureFetch(radarRoutes())
    const r = await fetchGithub({ fetchImpl, limiter: NO_WAIT, now: NOW, terms: [TERM], githubToken: 'tok' })
    expect(fetchImpl.calls).toHaveLength(4)
    expect(r.items).toHaveLength(4)
  })

  it('stops after a rate limit', async () => {
    const fetchImpl = fixtureFetch([{ match: (u) => u.host === 'api.github.com', status: 403, body: {} }])
    await expect(fetchGithub({ fetchImpl, limiter: NO_WAIT, now: NOW })).rejects.toThrow('HTTP 403')
    expect(fetchImpl.calls).toHaveLength(1)
  })
})

describe('arXiv parser', () => {
  it('maps entries, drops the version and finds code links', () => {
    const items = toArxivItems(radarText('arxiv.xml'))
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      source: 'arxiv',
      externalId: '2601.00001',
      title: 'Zorb: A Small Fast Model',
      url: 'https://arxiv.org/abs/2601.00001',
      metrics: { arxivId: '2601.00001', links: ['https://github.com/acme-lab/zorb'] },
    })
    expect(items[0]?.publishedAt?.toISOString()).toBe('2026-10-01T17:59:41.000Z')
  })

  it('queries cs.CL, cs.LG and cs.AI by submission date', async () => {
    const url = new URL(arxivQueryUrl())
    expect(url.host).toBe('export.arxiv.org')
    expect(url.searchParams.get('search_query')).toBe('cat:cs.CL OR cat:cs.LG OR cat:cs.AI')
    expect(url.searchParams.get('sortBy')).toBe('submittedDate')
    const r = await fetchArxiv({ fetchImpl: fixtureFetch(radarRoutes()), limiter: NO_WAIT })
    expect(r.items).toHaveLength(2)
  })
})

describe('Hacker News parser', () => {
  it('keeps stories naming the term in the title or link', () => {
    const items = toHnItems(radarJson<{ hn: unknown }>('news.json').hn, TERM)
    expect(items.map((i) => i.externalId)).toEqual(['9001', '9003'])
    expect(items[0]).toMatchObject({
      url: 'https://news.ycombinator.com/item?id=9001',
      metrics: { points: 42, comments: 7, links: ['https://github.com/acme-lab/zorb'] },
    })
    expect(items[1]?.excerpt).toBe('I tried zorb & others')
  })

  it('searches the last week of stories per term', async () => {
    const url = new URL(hnTermUrl('Zorb', NOW))
    expect(url.searchParams.get('query')).toBe('"Zorb"')
    expect(url.searchParams.get('numericFilters')).toBe(`created_at_i>${Math.floor(NOW.getTime() / 1000) - 604800}`)
    const r = await fetchHnTerms({ fetchImpl: fixtureFetch(radarRoutes()), limiter: NO_WAIT, now: NOW, terms: [TERM] })
    expect(r.items).toHaveLength(2)
    expect((await fetchHnTerms({ terms: [] })).items).toEqual([])
  })
})

describe('GDELT parser', () => {
  it('keeps https headlines naming the term and collapses syndicated copies', () => {
    const items = toGdeltItems(radarJson<{ gdelt: unknown }>('news.json').gdelt, TERM)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'news', url: 'https://news.example.com/zorb-launch', excerpt: 'Reported by news.example.com' })
    expect(items[0]?.publishedAt?.toISOString()).toBe('2026-10-05T00:00:00.000Z')
  })

  it('queries a 7-day phrase search and records failures per term', async () => {
    expect(new URL(gdeltTermUrl('Zorb')).searchParams.get('query')).toBe('"Zorb"')
    const fetchImpl = fixtureFetch([{ match: (u) => u.host === 'api.gdeltproject.org', status: 429, body: {} }])
    await expect(
      fetchGdeltTerms({ fetchImpl, limiter: NO_WAIT, terms: [TERM, { id: 't2', term: 'Other', aliases: [] }] }),
    ).rejects.toThrow('rate limited (429)')
    expect(fetchImpl.calls).toHaveLength(1)
  })
})

describe('official feed parser', () => {
  it('reads RSS 2.0: recent posts with a link only', () => {
    const items = toFeedItems(radarText('feed-rss.xml'), feed, NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      source: 'feeds',
      kind: 'product',
      title: 'Introducing Zorb',
      url: 'https://lab.example.com/news/introducing-zorb/',
      excerpt: 'Zorb is our new model.',
      metrics: { feedId: 'example-lab' },
    })
    expect(items[0]?.externalId).toMatch(/^example-lab:[0-9a-f]{16}$/)
  })

  it('reads Atom entries', () => {
    const items = toFeedItems(radarText('feed-atom.xml'), { ...feed, id: 'example-dev' }, NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ url: 'https://dev.example.com/blog/serving-zorb/', excerpt: 'How we serve Zorb.' })
  })

  it('records a failing feed and keeps the others', async () => {
    const fetchImpl = fixtureFetch([
      { match: (u) => u.host === 'lab.example.com', body: radarText('feed-rss.xml') },
      { match: (u) => u.host === 'dev.example.com', status: 404, body: '' },
    ])
    const r = await fetchOfficialFeeds({
      fetchImpl,
      limiter: NO_WAIT,
      now: NOW,
      feeds: [feed, { ...feed, id: 'gone', url: 'https://dev.example.com/feed' }],
    })
    expect(r.items).toHaveLength(1)
    expect(r.partialErrors).toEqual(['feed gone: HTTP 404'])
  })
})

describe('term rotation', () => {
  it('searches every term when few, and rotates daily when many', () => {
    const terms = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, term: `term${i}`, aliases: [] }))
    expect(termsForRun({ terms: terms.slice(0, 3) })).toHaveLength(3)
    const a = termsForRun({ terms, now: new Date('2026-10-08T00:00:00Z') }).map((t) => t.id)
    const b = termsForRun({ terms, now: new Date('2026-10-09T00:00:00Z') }).map((t) => t.id)
    expect(a).toHaveLength(5)
    expect(a).not.toEqual(b)
    expect(termsForRun({ terms: [{ id: 'm', term: 'muted', aliases: [], muted: true }] })).toEqual([])
  })
})
