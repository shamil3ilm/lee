import { describe, expect, it } from 'vitest'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { REPUTATION_USER_AGENT } from '@/lib/reputation/http'
import { toFeedItems } from '@/lib/radar/sources/feeds'
import { toLaunchItems } from '@/lib/radar/new/feeds'
import { fetchGithubNew, newRepoQueryUrl, toNewRepoItems } from '@/lib/radar/new/github'
import { fetchHfNew, formatParams, hfListUrl, modelGroup, toNewDatasetItems, toNewModelItems, toNewSpaceItems } from '@/lib/radar/new/hf'
import { arxivStoriesUrl, fetchHnNew, isTech, showLaunchUrl, showName, toArxivStoryItems, toShowItems } from '@/lib/radar/new/hn'
import { detectLaunch } from '@/lib/radar/new/launch'
import { fetchPapersNew, toNewPaperItems } from '@/lib/radar/new/papers'
import { fetchReleases, normalizeVersion, toEolItems, toGithubReleaseItems } from '@/lib/radar/new/releases'
import { releaseProject } from '@/lib/radar/new/projects'
import { fixtureFetch } from '@/tests/fixtures/reputation/fetch'
import { newJson, newRoutes } from '@/tests/fixtures/radar/new/fetch'

const NOW = new Date('2026-10-08T09:00:00Z')
const hf = newJson<{ models: unknown; spaces: unknown; datasets: unknown }>('hf.json')

describe('Hugging Face recent models', () => {
  it('keeps models created in the last 14 days with early traction, with licence, size and base model', () => {
    const items = toNewModelItems(hf.models, NOW)
    const ids = items.map((i) => i.metrics.repoId)
    // Old (2025), NSFW-tagged and low-likes models are dropped.
    expect(ids).not.toContain('oldlab/OldBase-8B')
    expect(ids).not.toContain('spammy/Spicy-Model')
    expect(ids).not.toContain('tiny/LowLikes-1B')
    const zorb = items.find((i) => i.metrics.repoId === 'acme-lab/Zorb-27B')
    expect(zorb).toMatchObject({
      source: 'hf',
      externalId: 'model:acme-lab/Zorb-27B',
      category: 'model',
      openness: 'open',
      group: 'llm',
      entityKey: 'hf:model:acme-lab/zorb-27b',
      metrics: { likes: 600, license: 'apache-2.0', params: 27781427952, arxivId: '2610.00001', createdAt: '2026-10-02' },
    })
    expect(zorb?.excerpt).toBe('LLM · text-generation · 27.8B params · license apache-2.0')
    const gguf = items.find((i) => i.metrics.repoId === 'quantfolk/Zorb-27B-GGUF')
    expect(gguf?.metrics).toMatchObject({ baseModel: 'acme-lab/Zorb-27B', baseRelation: 'quantized' })
    // likes per day since creation: 600 likes over 6 days beats 80 over 7.
    const tts = items.find((i) => i.metrics.repoId === 'voicelab/Chirp-TTS')
    expect(zorb!.traction).toBeGreaterThan(tts!.traction)
  })

  it('groups by pipeline (LLM, multimodal, vision, speech, embedding, code)', () => {
    expect(modelGroup('text-generation', 'a/b', [])).toBe('llm')
    expect(modelGroup('image-text-to-text', 'a/b', [])).toBe('multimodal')
    expect(modelGroup('text-to-image', 'a/b', [])).toBe('vision')
    expect(modelGroup('automatic-speech-recognition', 'a/b', [])).toBe('speech')
    expect(modelGroup('feature-extraction', 'a/b', [])).toBe('embedding')
    expect(modelGroup('text-generation', 'acme/zorb-coder-7b', [])).toBe('code')
    expect(modelGroup(undefined, 'a/b', [])).toBe('other')
    expect(formatParams(9_400_000_000)).toBe('9.4B')
    expect(formatParams(undefined)).toBeNull()
  })

  it('maps recent Spaces and datasets (metadata only, never the card text)', () => {
    const spaces = toNewSpaceItems(hf.spaces, NOW)
    expect(spaces.map((s) => s.title)).toEqual(['acme-lab/zorb-demo'])
    expect(spaces[0]).toMatchObject({ category: 'tool', group: 'space', entityKey: 'hf:space:acme-lab/zorb-demo' })
    const datasets = toNewDatasetItems(hf.datasets, NOW)
    expect(datasets[0]?.excerpt).toBe('Hugging Face dataset · text · size 1K<n<10K · license cc-by-4.0')
    expect(datasets[0]?.excerpt).not.toMatch(/@|example\.com/)
  })

  it('asks the trending list with the metadata it needs', () => {
    const u = new URL(hfListUrl('models'))
    expect(u.searchParams.get('sort')).toBe('trendingScore')
    expect(u.searchParams.getAll('expand[]')).toEqual(expect.arrayContaining(['createdAt', 'safetensors', 'tags', 'likes']))
  })

  it('fetches the three lists with the honest User-Agent', async () => {
    const fetchImpl = fixtureFetch(newRoutes())
    const r = await fetchHfNew({ fetchImpl, limiter: NO_WAIT, now: NOW })
    expect(r.items.map((i) => i.group)).toEqual(expect.arrayContaining(['llm', 'space', 'dataset']))
    expect(fetchImpl.agents.every((a) => a === REPUTATION_USER_AGENT)).toBe(true)
  })
})

describe('GitHub created-recently search', () => {
  it('builds a created:> query sorted by stars without forks or archived repos', () => {
    const u = new URL(newRepoQueryUrl({ id: 'laravel', q: 'topic:laravel', minStars: 10 }, NOW))
    expect(u.searchParams.get('q')).toBe('topic:laravel created:>2026-09-08 stars:>=10 fork:false archived:false')
    expect(u.searchParams.get('sort')).toBe('stars')
  })

  it('maps new repos and drops forks and mirrors', () => {
    const items = toNewRepoItems(newJson('github.json'), { id: 'laravel', minStars: 10 }, NOW)
    expect(items.map((i) => i.title)).toEqual(['acme-lab/zorb', 'artisan-dev/ledgerly'])
    expect(items[0]).toMatchObject({ category: 'tool', group: 'repo', openness: 'open', entityKey: 'gh:acme-lab/zorb', metrics: { stars: 900, license: 'Apache-2.0' } })
    // No licence: public, not "open source".
    expect(items[1]?.openness).toBeNull()
    expect(items[1]?.tags).toEqual(expect.arrayContaining(['laravel', 'payments', 'php']))
  })

  it('stops after a rate limit', async () => {
    const fetchImpl = fixtureFetch([{ match: (u) => u.host === 'api.github.com', status: 403, body: {} }])
    await expect(fetchGithubNew({ fetchImpl, limiter: NO_WAIT, now: NOW })).rejects.toThrow(/403/)
    expect(fetchImpl.calls).toHaveLength(1)
  })
})

describe('releases (endoflife.date and GitHub)', () => {
  const laravel = releaseProject('laravel')!
  const next = releaseProject('nextjs')!
  const rel = newJson<{ eol: unknown; github: unknown }>('releases.json')

  it('turns a release cycle that started in the last 30 days into a release with EOL facts (US dates)', () => {
    const items = toEolItems(rel.eol, laravel, NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      source: 'releases',
      title: 'Laravel 14',
      category: 'release',
      entityKey: 'release:laravel@14',
      url: 'https://endoflife.date/laravel',
      metrics: { version: '14', latest: '14.0.3', eol: '2028-09-22', links: ['https://laravel.com/docs/14.x/releases'] },
    })
    expect(items[0]?.excerpt).toContain('released Sep 22, 2026')
    expect(items[0]?.excerpt).toContain('security support until Sep 22, 2028')
  })

  it('keeps GitHub x.y.0 releases only (no patches, prereleases or old ones)', () => {
    const items = toGithubReleaseItems(rel.github, next, NOW)
    expect(items.map((i) => i.title)).toEqual(['Next.js 16.5', 'Next.js 17'])
    expect(items[1]?.entityKey).toBe('release:nextjs@17')
    expect(normalizeVersion('16.0')).toBe('16')
  })

  it('fetches each project once from its sources', async () => {
    const fetchImpl = fixtureFetch(newRoutes())
    const r = await fetchReleases({ fetchImpl, limiter: NO_WAIT, now: NOW, projects: ['laravel', 'nextjs', 'unknown'] })
    expect(fetchImpl.calls.map((c) => new URL(c).host)).toEqual(['endoflife.date', 'endoflife.date', 'api.github.com'])
    expect(r.items.map((i) => i.entityKey)).toEqual(expect.arrayContaining(['release:laravel@14', 'release:nextjs@17']))
  })
})

describe('Hacker News Show/Launch and arXiv discussions', () => {
  const hn = newJson<{ show: unknown; arxiv: unknown }>('hn.json')

  it('keeps tech Show HN / Launch HN posts above the points threshold', () => {
    const items = toShowItems(hn.show, NOW)
    expect(items.map((i) => i.externalId)).toEqual(['7001', '7002'])
    expect(items[0]).toMatchObject({ category: 'news', group: 'show', name: 'Zorb', metrics: { points: 210, links: ['https://github.com/acme-lab/zorb'] } })
    expect(items[1]).toMatchObject({ group: 'launch', name: 'Ledgerly' })
    expect(isTech('A pendulum clock made from scrap', 'https://clock.example.org/')).toBe(false)
    expect(showName('Show HN: Foo.page – Turn any screen into a sign')).toBe('Foo.page')
  })

  it('ranks arXiv papers by discussion: only stories linking a paper', () => {
    const items = toArxivStoryItems(hn.arxiv, NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ category: 'paper', entityKey: 'arxiv:2610.00001', url: 'https://arxiv.org/abs/2610.00001', metrics: { points: 177 } })
  })

  it('queries the last week with thresholds', async () => {
    expect(decodeURIComponent(showLaunchUrl(NOW))).toContain('tags=(show_hn,launch_hn)')
    expect(decodeURIComponent(arxivStoriesUrl(NOW))).toContain('points>=30')
    const r = await fetchHnNew({ fetchImpl: fixtureFetch(newRoutes()), limiter: NO_WAIT, now: NOW })
    expect(r.items).toHaveLength(3)
  })
})

describe('HF Daily Papers by upvotes', () => {
  it('keeps upvoted papers keyed by arXiv id', async () => {
    const r = await fetchPapersNew({ fetchImpl: fixtureFetch(newRoutes()), limiter: NO_WAIT, now: NOW })
    expect(r.items.map((i) => i.entityKey)).toEqual(['arxiv:2610.00001'])
    expect(toNewPaperItems([], NOW)).toEqual([])
  })
})

describe('launch detection on lab-feed posts', () => {
  it.each([
    ['Introducing Gemini 9 Flash', true, true, 'Gemini 9 Flash'],
    ['GPT-7.5 is now available in the API', true, true, 'GPT-7.5'],
    ['Zorb Large 3 released with open weights', true, true, 'Zorb Large 3'],
    ['Announcing the Agents SDK', true, false, 'the Agents SDK'],
    ['Introducing Clusterkit v1.0: stable GPU configs', true, false, 'Clusterkit v1.0'],
    ['Open-sourcing Briefer, the fast report-generation model', true, true, null],
    ['How we scaled inference for 2026', false, false, null],
    ['Customer story: a bank runs Zorb 2', false, false, null],
    ['Our 2026 research agenda', false, false, null],
  ])('%s', (title, launch, model, name) => {
    const info = detectLaunch({ title })
    expect(info.launch).toBe(launch)
    expect(info.model).toBe(model)
    if (launch) expect(info.name).toBe(name)
  })

  it('is proprietary unless the post links to or names open weights', () => {
    expect(detectLaunch({ title: 'Introducing Zorb 4' }).openness).toBe('proprietary')
    expect(detectLaunch({ title: 'Introducing Zorb 4', links: ['https://huggingface.co/acme-lab/Zorb-4'] }).openness).toBe('open')
    expect(detectLaunch({ title: 'Introducing Zorb 4', excerpt: 'Weights are released under Apache 2.0.' }).openness).toBe('open')
    expect(detectLaunch({ title: 'Open-sourcing Briefer, the fast report-generation model' }).openness).toBe('open')
  })

  it('keeps launches from the feed parser, with the open-weights link it found', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>Introducing Zorb 4</title><link>https://lab.example.com/news/zorb-4/</link><guid>z4</guid><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Download from <a href="https://huggingface.co/acme-lab/Zorb-4">the Hub</a>.</p>]]></description></item>
      <item><title>How we hire</title><link>https://lab.example.com/news/hire/</link><guid>h</guid><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`
    const feed = { id: 'example-lab', org: 'Example', label: 'Example Lab', url: 'https://lab.example.com/feed.xml' }
    const raw = toFeedItems(xml, feed, NOW)
    expect(raw[0]?.metrics.links).toEqual(['https://huggingface.co/acme-lab/Zorb-4'])
    const items = toLaunchItems(raw)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ category: 'model', openness: 'open', name: 'Zorb 4', entityKey: expect.stringMatching(/^feed:example-lab:/) })
  })
})
