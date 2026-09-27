import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdapter } from '@/lib/discovery/adapters'
import { HimalayasAdapter, normalizeHimalayasJob } from '@/lib/discovery/adapters/himalayas'
import { JobicyAdapter, geosFor } from '@/lib/discovery/adapters/jobicy'
import { WeWorkRemotelyAdapter, parseWwrFeed } from '@/lib/discovery/adapters/weworkremotely'
import { RemotiveAdapter } from '@/lib/discovery/adapters/remotive'
import { AdzunaAdapter, MissingAdzunaKeyError, parseAdzunaKey } from '@/lib/discovery/adapters/adzuna'
import { remoteOkTags } from '@/lib/discovery/adapters/remoteok'
import { WorkingNomadsAdapter } from '@/lib/discovery/adapters/workingnomads'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'

// Response shapes copied from live calls on 2026-09-27, values invented.

let originalFetch: typeof globalThis.fetch
let calls: string[]

function mockFetch(handler: (url: string) => Response | Promise<Response>): void {
  calls = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    return handler(url)
  }) as typeof globalThis.fetch
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })
const job = (i: { normalized: unknown }): NormalizedJob => i.normalized as NormalizedJob

beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('HimalayasAdapter', () => {
  const himalayasJob = (guid: string, restrictions: string[] = []) => ({
    title: 'Backend Engineer',
    excerpt: 'Build APIs',
    companyName: 'Acme',
    employmentType: 'Full Time',
    seniority: ['Mid-level'],
    locationRestrictions: restrictions,
    pubDate: 1790437813,
    applicationLink: guid,
    guid,
  })

  it('searches each target country plus worldwide, dedupes by guid and tags geo', async () => {
    mockFetch((url) =>
      !url.includes('country=')
        ? json({ jobs: [himalayasJob('https://himalayas.app/companies/acme/jobs/a')] })
        : json({ jobs: [himalayasJob('https://himalayas.app/companies/acme/jobs/b', ['United Arab Emirates']), himalayasJob('https://himalayas.app/companies/acme/jobs/a')] }),
    )
    const items = await new HimalayasAdapter().fetch({ countries: 'AE,IN', keywords: 'backend developer' })
    expect(calls).toHaveLength(3)
    expect(calls[0]).toContain('country=AE')
    expect(calls[0]).toContain('exclude_worldwide=true')
    expect(calls[0]).toContain('seniority=Entry-level%2CMid-level')
    expect(items.map((i) => i.sourceItemId).sort()).toEqual([
      'https://himalayas.app/companies/acme/jobs/a',
      'https://himalayas.app/companies/acme/jobs/b',
    ])
    const b = items.find((i) => i.sourceItemId.endsWith('/b'))!
    expect(job(b)).toMatchObject({ location: 'Remote (United Arab Emirates)', remoteType: 'remote', employmentType: 'fulltime' })
    expect(job(b).tags).toEqual(['board:himalayas', 'geo:restricted'])
    expect(job(b).postedAt?.toISOString()).toBe(new Date(1790437813 * 1000).toISOString())
  })

  it('summarises long country lists', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((c) => `Country ${c}`)
    const item = normalizeHimalayasJob(himalayasJob('https://himalayas.app/x', many))!
    expect(job(item).location).toBe('Remote (Country A, Country B, Country C, Country D +2 more)')
  })

  it('stops on 429 but keeps what it fetched; throws when nothing succeeded', async () => {
    let n = 0
    mockFetch(() => (n++ === 0 ? json({ jobs: [himalayasJob('https://himalayas.app/j/1')] }) : new Response('', { status: 429 })))
    expect(await new HimalayasAdapter().fetch({ countries: 'AE,SA,QA' })).toHaveLength(1)
    mockFetch(() => new Response('', { status: 429 }))
    await expect(new HimalayasAdapter().fetch({})).rejects.toThrow(/himalayas 429/)
  })
})

describe('JobicyAdapter', () => {
  it('maps target countries to Jobicy regions', () => {
    expect(geosFor(['AE', 'SA', 'IN'])).toEqual(['anywhere', 'united-arab-emirates', 'emea', 'apac'])
    expect(geosFor([])).toEqual(['anywhere'])
  })

  it('normalizes jobs and credits the Jobicy URL as the apply link', async () => {
    mockFetch(() =>
      json({
        jobs: [
          { id: 151779, url: 'https://jobicy.com/jobs/151779-backend', jobTitle: 'Backend Engineer', companyName: 'TeamSnap', jobType: ['Full-Time'], jobGeo: 'Anywhere', jobExcerpt: 'x', pubDate: '2026-09-26T11:10:07+00:00' },
          { id: 2, url: 'https://jobicy.com/jobs/2', jobTitle: 'Dev', companyName: 'B', jobGeo: 'EMEA,  UK' },
          { id: 3, jobTitle: 'no url' },
        ],
      }),
    )
    const items = await new JobicyAdapter().fetch({ countries: 'IN' })
    expect(calls.map((c) => new URL(c).searchParams.get('geo'))).toEqual(['anywhere', 'apac'])
    expect(items).toHaveLength(2)
    expect(job(items[0]!)).toMatchObject({ applyUrl: 'https://jobicy.com/jobs/151779-backend', location: 'Remote (Anywhere)', tags: ['board:jobicy', 'geo:worldwide'] })
    expect(job(items[1]!)).toMatchObject({ location: 'Remote (EMEA, UK)', tags: ['board:jobicy', 'geo:restricted'] })
  })
})

describe('WeWorkRemotelyAdapter', () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Twikey: Java Developer</title><region>Anywhere in the World</region><skills>Java, PostgreSQL, and Spring</skills><type>Full-Time</type>
      <pubDate>Fri, 26 Sep 2026 10:00:00 +0000</pubDate><guid>https://weworkremotely.com/remote-jobs/twikey-java-developer</guid><link>https://weworkremotely.com/remote-jobs/twikey-java-developer</link></item>
    <item><title>Acme: Backend Engineer</title><region>USA Only</region><guid>https://weworkremotely.com/remote-jobs/acme-backend</guid><link>https://weworkremotely.com/remote-jobs/acme-backend</link></item>
  </channel></rss>`

  it('splits "Company: Role" and reads region / skills', () => {
    const items = parseWwrFeed(rss)
    expect(job(items[0]!)).toMatchObject({
      title: 'Java Developer',
      companyName: 'Twikey',
      location: 'Remote (Anywhere in the World)',
      techStack: ['Java', 'PostgreSQL', 'Spring'],
      tags: ['board:weworkremotely', 'geo:worldwide'],
      employmentType: 'fulltime',
    })
    expect(job(items[1]!).tags).toContain('geo:restricted')
  })

  it('fetches the back-end and full-stack feeds by default, deduping across them', async () => {
    mockFetch(() => new Response(rss, { status: 200 }))
    const items = await new WeWorkRemotelyAdapter().fetch({})
    expect(calls).toEqual([
      'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
      'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
    ])
    expect(items).toHaveLength(2)
  })
})

describe('RemotiveAdapter', () => {
  it('normalizes and tags worldwide roles', async () => {
    mockFetch(() =>
      json({
        '0-legal-notice': 'link back',
        jobs: [
          { id: 1, url: 'https://remotive.com/remote-jobs/software-dev/a', title: 'Backend Dev', company_name: 'A', job_type: 'full_time', candidate_required_location: 'Worldwide', tags: ['go'] },
          { id: 2, url: 'https://remotive.com/remote-jobs/software-dev/b', title: 'Dev', company_name: 'B', candidate_required_location: 'USA' },
        ],
      }),
    )
    const items = await new RemotiveAdapter().fetch()
    expect(job(items[0]!)).toMatchObject({ tags: ['board:remotive', 'geo:worldwide'], techStack: ['go'], employmentType: 'fulltime' })
    expect(job(items[1]!).tags).toContain('geo:restricted')
  })
})

describe('AdzunaAdapter', () => {
  const adzunaBody = {
    results: [
      {
        id: '5000123',
        title: '<strong>Backend</strong> Developer',
        description: 'Node.js <strong>backend</strong> role',
        created: '2026-09-25T10:00:00Z',
        redirect_url: 'https://www.adzuna.in/land/ad/5000123?se=x',
        company: { display_name: 'Acme India' },
        location: { display_name: 'Bengaluru, Karnataka' },
        contract_time: 'full_time',
      },
    ],
  }

  it('parses APP_ID:APP_KEY', () => {
    expect(parseAdzunaKey('abc:def123')).toEqual({ appId: 'abc', appKey: 'def123' })
    expect(parseAdzunaKey('nocolon')).toBeNull()
    expect(parseAdzunaKey(':x')).toBeNull()
  })

  it('refuses to run without a key', async () => {
    const a = new AdzunaAdapter({ resolveKey: async () => null })
    await expect(a.fetch({}, { userId: 'u' })).rejects.toBeInstanceOf(MissingAdzunaKeyError)
  })

  it('searches only countries Adzuna supports (India, not the GCC)', async () => {
    mockFetch(() => json(adzunaBody))
    const a = new AdzunaAdapter({ resolveKey: async () => 'id1:key1' })
    const items = await a.fetch({ countries: 'AE,SA,IN', keywords: 'backend developer,full stack developer' })
    expect(calls).toHaveLength(2)
    for (const c of calls) expect(c.startsWith('https://api.adzuna.com/v1/api/jobs/in/search/1?')).toBe(true)
    expect(items).toHaveLength(1)
    expect(job(items[0]!)).toMatchObject({
      title: 'Backend Developer',
      companyName: 'Acme India',
      applyUrl: 'https://www.adzuna.in/land/ad/5000123?se=x',
      tags: ['board:adzuna', 'country:in'],
    })
  })

  it('returns nothing (no calls) for GCC-only targets', async () => {
    mockFetch(() => json(adzunaBody))
    const a = new AdzunaAdapter({ resolveKey: async () => 'id1:key1' })
    expect(await a.fetch({ countries: 'AE' })).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('reports a rejected key without leaking it', async () => {
    mockFetch(() => json({ exception: 'AUTH_FAIL' }, 401))
    const a = new AdzunaAdapter({ resolveKey: async () => 'id1:secretkey' })
    const err = await a.fetch({ countries: 'IN' }).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('adzuna rejected the API key')
  })
})

describe('WorkingNomadsAdapter', () => {
  it('keeps Development jobs, strips the company prefix from titles', async () => {
    mockFetch(() =>
      json([
        { url: 'https://www.workingnomads.com/job/go/1/', title: 'Acme - Backend Engineer', company_name: 'Acme', category_name: 'Development', tags: 'go,postgres', location: 'Remote, Anywhere', pub_date: '2026-09-25T02:36:13-04:00' },
        { url: 'https://www.workingnomads.com/job/go/2/', title: 'Marketer', company_name: 'B', category_name: 'Marketing' },
      ]),
    )
    const items = await new WorkingNomadsAdapter().fetch()
    expect(items).toHaveLength(1)
    expect(job(items[0]!)).toMatchObject({ title: 'Backend Engineer', techStack: ['go', 'postgres'], tags: ['board:workingnomads', 'geo:worldwide'] })
  })
})

describe('RemoteOK tags', () => {
  it('marks worldwide vs restricted, never filters', () => {
    expect(remoteOkTags('Worldwide')).toEqual(['board:remoteok', 'geo:worldwide'])
    expect(remoteOkTags('')).toEqual(['board:remoteok', 'geo:worldwide'])
    expect(remoteOkTags('Remote Europe')).toEqual(['board:remoteok', 'geo:restricted'])
  })
})

describe('registry', () => {
  it('registers every new kind', () => {
    for (const kind of ['himalayas', 'jobicy', 'weworkremotely', 'remotive', 'adzuna', 'recruitee', 'pinpoint', 'email_alert']) {
      expect(getAdapter(kind)?.kind).toBe(kind)
    }
  })
})
