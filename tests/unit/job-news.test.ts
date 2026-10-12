import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractPost, cleanTitle, employerOf, SNIPPET_MAX, type WpPost } from '@/lib/discovery/job-news/extract'
import { leadsOf } from '@/lib/discovery/job-news/leads'
import { detectJobCategories, readJobNews, titleOnlyItems, type JobNewsDeps } from '@/lib/discovery/adapters/wp-job-news'
import { getAdapter } from '@/lib/discovery/adapters'
import type { DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { assessScam } from '@/lib/scam/engine'
import { inputFromNormalizedJob } from '@/lib/scam/input'
import { isListedHost } from '@/lib/net/outbound-hosts'
import { fakeBamboo } from '@/tests/fixtures/bamboohr/serve'

const POSTS = JSON.parse(readFileSync(join(__dirname, '../fixtures/job-news/posts.json'), 'utf8')) as WpPost[]
const OPTS = { siteHost: 'www.pravasinewsdaily.com', countryCategories: { '3': 'AE', '47': 'KW', '8': 'QA', '344': 'IN' } }
/** The Pravasi News Daily preset's config (lib/defaults/catalog-v7.ts). */
const CONFIG = {
  url: 'https://www.pravasinewsdaily.com',
  jobCategories: [20],
  countryCategories: { '3': 'AE', '47': 'KW', '8': 'QA', '344': 'IN' },
  siteName: 'Pravasi News Daily',
  siteKey: 'pravasinewsdaily',
}
const post = (id: number): WpPost => POSTS.find((p) => p.id === id)!
const job = (i: DiscoveryItem): NormalizedJob => i.normalized as NormalizedJob

/** The WP REST API answering from the fixture; nothing else is reachable. */
function wpDeps(extra: Partial<JobNewsDeps> = {}): JobNewsDeps & { urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    now: new Date('2026-10-12T12:00:00Z'),
    getText: async (url) => {
      urls.push(url)
      if (url.includes('/wp-json/wp/v2/posts')) return { ok: true, status: 200, text: JSON.stringify(POSTS), type: 'application/json' }
      return { ok: false, status: 404, text: '', type: 'text/html' }
    },
    ...extra,
  }
}

describe('job-news post extraction', () => {
  it('AIU post: employer, Kuwait, roles, BambooHR job links and the employer site; the site’s own links dropped', () => {
    const f = extractPost(post(47580), OPTS)
    expect(f.employer).toBe('American International University')
    expect(f.country).toBe('KW')
    expect(f.regionIds).toEqual(['kw'])
    expect(f.roles).toEqual(['Web Developer & Designer / SEO Specialist', 'Director of the Foundation Program', 'Mandoub', 'Talent Acquisition Specialist'])
    expect(f.links.filter((l) => l.board).map((l) => `${l.board!.kind}:${l.board!.slug}#${l.board!.jobId}`)).toEqual([
      'bamboohr:aiu#522',
      'bamboohr:aiu#520',
      'bamboohr:aiu#527',
      'bamboohr:aiu#488',
    ])
    expect(f.links.some((l) => l.url.includes('pravasinewsdaily') || l.url.includes('whatsapp'))).toBe(false)
    expect(f.employerWebsite).toBe('https://www.aiu.edu.kw')
    expect(f.walkIn).toBeNull()
    expect(f.snippet.length).toBeLessThanOrEqual(SNIPPET_MAX)
  })

  it('walk-in post: employer from the "Company Name" row, roles, date, time, venue, email and the fee sentence', () => {
    const f = extractPost(post(47535), OPTS)
    expect(f.employer).toBe('Gulf Movers')
    expect(f.country).toBe('AE')
    expect(f.roles).toEqual(['Drivers', 'IT Support Technicians'])
    expect(f.walkIn).toEqual({ dates: 'October 14, 2026', time: '9:00 AM to 1:00 PM', venue: 'Al Qusais Business Centre, Dubai' })
    expect(f.emails).toEqual(['jobs@gulfmovers.example'])
    expect(f.risk.join(' ')).toMatch(/registration fee/)
    expect(f.risk.join(' ')).toMatch(/WhatsApp only/)
  })

  it('the site’s own fee disclaimers are not risk sentences; the employer’s home page beats its careers subdomain', () => {
    const f = extractPost(post(47749), OPTS)
    expect(f.employer).toBe('Crescent Energy')
    expect(f.risk).toEqual([])
    expect(f.roles).toEqual(['Network Engineer', 'Security Analyst', 'Rewards Analyst'])
    expect(f.employerWebsite).toBe('https://www.crescentenergy.example')
  })

  it('reads employers from the common title patterns', () => {
    expect(employerOf(cleanTitle('First Abu Dhabi Bank Announces Multiple Job Vacancies in the UAE'), '')).toBe('First Abu Dhabi Bank')
    expect(employerOf(cleanTitle('Accountant Job in Dubai at MedNet Global Healthcare Solutions LLC |Apply Now'), '')).toBe('MedNet Global Healthcare Solutions LLC')
    expect(employerOf(cleanTitle('AGMC UAE Job Vacancies 2026: Walk-In Interview'), '')).toBe('AGMC')
    expect(employerOf(cleanTitle('American University of Sharjah Announces Multiple Job Vacancies'), '')).toBe('American University of Sharjah')
    expect(employerOf(cleanTitle('Latest Accounting Jobs in UAE – Top Companies Hiring in 2026'), '')).toBeNull()
  })
})

describe('job-news routing', () => {
  let original: typeof globalThis.fetch
  beforeEach(() => {
    original = globalThis.fetch
    globalThis.fetch = fakeBamboo().fetch
  })
  afterEach(() => {
    globalThis.fetch = original
  })

  it('(a) reads linked ATS jobs through the ATS, (c) title-only roles for posts without one', async () => {
    const greenhouseHit: DiscoveryItem = {
      sourceItemId: '4012345',
      raw: {},
      normalized: { kind: 'job', title: 'Backend Developer', companyName: 'acmelabs', location: 'Dubai', descriptionMd: 'Laravel APIs', applyUrl: 'https://boards.greenhouse.io/acmelabs/jobs/4012345', techStack: [], raw: {} },
    }
    const deps = wpDeps({
      fetchJob: async (board, facts, ctx) => {
        if (board.kind === 'greenhouse') return greenhouseHit
        const { fetchBambooJob } = await import('@/lib/discovery/adapters/bamboohr')
        return board.jobId ? fetchBambooJob(board.slug, board.jobId, facts.employer ?? board.slug) : (void ctx, null)
      },
    })
    const run = await readJobNews(CONFIG, undefined, deps)
    expect(deps.urls[0]).toContain('/wp-json/wp/v2/posts?categories=20&after=2026-10-09T12%3A00%3A00.000Z')
    expect(run.stats).toMatchObject({ posts: 4, direct: 3 })
    const ids = run.items.map((i) => i.sourceItemId)
    // (a) AIU 522 and 527 exist on the board; 520 and 488 are closed there (not ingested).
    expect(ids).toEqual(expect.arrayContaining(['bamboohr:aiu:522', 'bamboohr:aiu:527', 'greenhouse:acmelabs:4012345']))
    const web = job(run.items.find((i) => i.sourceItemId === 'bamboohr:aiu:522')!)
    expect(web).toMatchObject({ companyName: 'American International University', applyUrl: 'https://aiu.bamboohr.com/careers/522', subSource: 'pravasinewsdaily' })
    expect(web.tags).toEqual(expect.arrayContaining(['ats:bamboohr', 'via:job_news', 'news:pravasinewsdaily']))
    expect(job(run.items.find((i) => i.sourceItemId === 'greenhouse:acmelabs:4012345')!).companyName).toBe('Acme Labs')
    // (c) the walk-in and Crescent posts: one title-only row per role, linking to the post.
    expect(ids).toEqual(expect.arrayContaining(['post:47535:it-support-technicians', 'post:47749:network-engineer']))
    const walk = job(run.items.find((i) => i.sourceItemId === 'post:47535:it-support-technicians')!)
    expect(walk).toMatchObject({ title: 'IT Support Technicians', companyName: 'Gulf Movers', applyUrl: 'https://www.pravasinewsdaily.com/gulf-movers-walk-in-interview/' })
    expect(walk.tags).toEqual(expect.arrayContaining(['confidence:title-only', 'walk-in', 'country:ae']))
    expect(walk.descriptionMd).toContain('Walk-in interview: October 14, 2026 · 9:00 AM to 1:00 PM · Al Qusais Business Centre, Dubai')
    expect(walk.descriptionMd).toContain('Seen on Pravasi News Daily')
  })

  it('dedupes with a board the user reads directly, with stored links and with ids already seen', async () => {
    const deps = wpDeps({
      sources: async () => [{ kind: 'bamboohr', config: { company: 'aiu', displayName: 'American International University' } }],
      storedUrls: async (_u, urls) => new Set(urls.filter((u) => u.includes('greenhouse'))),
      fetchJob: async () => ({
        sourceItemId: 'x',
        raw: {},
        normalized: { kind: 'job', title: 'Backend Developer', companyName: 'x', descriptionMd: '', applyUrl: 'https://boards.greenhouse.io/acmelabs/jobs/4012345', techStack: [], raw: {} },
      }),
    })
    const run = await readJobNews(CONFIG, { userId: 'u', seenItemIds: async () => new Set() }, deps)
    expect(run.items.some((i) => i.sourceItemId.startsWith('bamboohr:'))).toBe(false)
    expect(run.items.some((i) => i.sourceItemId.startsWith('post:47580'))).toBe(false)
    expect(run.stats.dedupedWithBoard).toBe(4)
    expect(run.stats.dedupedStored).toBe(1)
  })

  it('falls back to the category RSS feed when the REST API is closed', async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><title>Acme Careers 2026: QA Engineer Vacancy in Dubai</title><link>https://www.pravasinewsdaily.com/acme-qa/</link><guid>https://www.pravasinewsdaily.com/?p=901</guid><pubDate>Mon, 12 Oct 2026 06:00:00 +0000</pubDate><content:encoded><![CDATA[<p>Acme is hiring.</p>]]></content:encoded></item></channel></rss>`
    const deps: JobNewsDeps = {
      now: new Date('2026-10-12T12:00:00Z'),
      getText: async (url) =>
        url.includes('feed=rss2') ? { ok: true, status: 200, text: rss, type: 'application/rss+xml' } : { ok: false, status: 401, text: '', type: '' },
    }
    const run = await readJobNews(CONFIG, undefined, deps)
    expect(run.items.map((i) => i.sourceItemId)).toEqual(['post:901:qa-engineer'])
  })

  it('detects the job category of a WordPress site', async () => {
    const deps: JobNewsDeps = {
      getText: async (url) =>
        url.includes('/categories')
          ? { ok: true, status: 200, type: 'application/json', text: JSON.stringify([{ id: 3, name: 'UAE', slug: 'uae', count: 732 }, { id: 20, name: 'Jobs', slug: 'latest-jobs', count: 513 }, { id: 55, name: 'Tech', slug: 'tech', count: 8 }]) }
          : { ok: true, status: 200, type: 'application/json', text: JSON.stringify({ name: 'Pravasi News Daily' }) },
    }
    const r = await detectJobCategories('https://www.pravasinewsdaily.com/some/page', deps)
    expect(r).toEqual({ siteName: 'Pravasi News Daily', categories: [{ id: 20, name: 'Jobs', slug: 'latest-jobs', count: 513 }] })
  })
})

describe('job-news leads and Scam Shield', () => {
  it('(b) leads: employer, country, board home page and attribution', () => {
    const facts = POSTS.map((p) => extractPost(p, OPTS))
    const leads = leadsOf(facts, 'Pravasi News Daily', 'pravasinewsdaily', new Date('2026-10-12T12:00:00Z'))
    const aiu = leads.find((l) => l.name === 'American International University')!
    expect(aiu).toMatchObject({
      website: 'https://www.aiu.edu.kw',
      regionIds: ['kw'],
      sourceTags: ['news:pravasinewsdaily'],
      board: { kind: 'bamboohr', slug: 'aiu', url: 'https://aiu.bamboohr.com/careers' },
      evidence: { seenOn: ['Pravasi News Daily'], listedAt: 'https://www.pravasinewsdaily.com/american-international-university-jobs-kuwait/', boardFound: { via: 'news' } },
    })
    // A website alone is still a lead (the weekly auto-detect looks for its board).
    expect(leads.find((l) => l.name === 'Crescent Energy')).toMatchObject({ website: 'https://www.crescentenergy.example' })
    expect(leads.find((l) => l.name === 'Gulf Movers')).toBeUndefined()
  })

  it('a walk-in post asking for a fee on WhatsApp is not "safe"', () => {
    const items = titleOnlyItems(extractPost(post(47535), OPTS), 'Pravasi News Daily', 'pravasinewsdaily')
    const r = assessScam(inputFromNormalizedJob(job(items[0]!), 'Pravasi News Daily (job news)'))
    expect(r.level).not.toBe('safe')
  })

  it('the Crescent post (no fee asked) stays safe', () => {
    const items = titleOnlyItems(extractPost(post(47749), OPTS), 'Pravasi News Daily', 'pravasinewsdaily')
    expect(assessScam(inputFromNormalizedJob(job(items[0]!), 'Pravasi News Daily (job news)')).level).toBe('safe')
  })

  it('registry and hosts', () => {
    expect(getAdapter('wp_job_news')?.kind).toBe('wp_job_news')
    expect(isListedHost('www.pravasinewsdaily.com')).toBe(true)
    expect(isListedHost('pravasivarthakal.in')).toBe(true)
  })
})
