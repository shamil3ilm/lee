import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkdayAdapter, countryFacet, parseWorkdayUrl, postedOnToDate } from '@/lib/discovery/adapters/workday'
import { WatchAdapter } from '@/lib/discovery/adapters/watch'
import { DISCOVERY_USER_AGENT } from '@/lib/discovery/adapters/http'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'

// Response shape from a live call (salesforce.wd12, 2026-09-27); values invented.
const COUNTRY_PARAM = 'CF_-_REC_-_LRV_-_Job_Posting_Anchor_-_Country_from_Job_Posting_Location_Extended'
const facets = [
  {
    facetParameter: COUNTRY_PARAM,
    values: [
      { descriptor: 'United States of America', id: 'us-id', count: 518 },
      { descriptor: 'India', id: 'in-id', count: 118 },
      { descriptor: 'United Arab Emirates', id: 'ae-id', count: 12 },
    ],
  },
  { facetParameter: 'jobFamilyGroup', values: [{ descriptor: 'Engineering', id: 'eng', count: 3 }] },
]
const posting = (i: number) => ({
  title: `Software Engineer ${i}`,
  externalPath: `/job/India---Bangalore/Software-Engineer_JR${i}`,
  locationsText: i % 2 ? '2 Locations' : 'India - Hyderabad',
  postedOn: 'Posted 3 Days Ago',
  bulletFields: [`JR${i}`],
})

let originalFetch: typeof globalThis.fetch
let bodies: Array<Record<string, unknown>>
let headers: Headers[]

beforeEach(() => {
  originalFetch = globalThis.fetch
  bodies = []
  headers = []
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockWorkday(total: number): void {
  globalThis.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { appliedFacets: Record<string, string[]>; offset: number }
    bodies.push(body)
    headers.push(new Headers(init?.headers))
    const filtered = Object.keys(body.appliedFacets).length > 0
    const count = Math.max(0, Math.min(20, total - body.offset))
    return new Response(
      JSON.stringify({
        total: body.offset === 0 ? (filtered ? total : 1523) : 0,
        facets,
        jobPostings: Array.from({ length: count }, (_, k) => posting(body.offset + k)),
      }),
      { status: 200 },
    )
  }) as typeof globalThis.fetch
}

describe('parseWorkdayUrl', () => {
  it('accepts myworkdayjobs career sites, with or without a locale', () => {
    expect(parseWorkdayUrl('https://salesforce.wd12.myworkdayjobs.com/External_Career_Site')).toEqual({
      host: 'salesforce.wd12.myworkdayjobs.com',
      tenant: 'salesforce',
      site: 'External_Career_Site',
    })
    expect(parseWorkdayUrl('https://acme.wd3.myworkdayjobs.com/en-US/Careers/job/x')?.site).toBe('Careers')
  })

  it('rejects other hosts (no fetching arbitrary URLs)', () => {
    expect(parseWorkdayUrl('https://evil.example/External')).toBeNull()
    expect(parseWorkdayUrl('https://salesforce.wd12.myworkdayjobs.com.evil.example/x')).toBeNull()
    expect(parseWorkdayUrl('http://salesforce.wd12.myworkdayjobs.com/External')).toBeNull()
    expect(parseWorkdayUrl('https://salesforce.wd12.myworkdayjobs.com/')).toBeNull()
  })
})

describe('WorkdayAdapter', () => {
  it('filters by the target countries through the site facet and pages up to the total', async () => {
    mockWorkday(45)
    const items = await new WorkdayAdapter().fetch({
      url: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site',
      countries: 'IN,AE',
      displayName: 'Salesforce',
    })
    expect(bodies[0]).toMatchObject({ appliedFacets: {}, offset: 0, limit: 20 })
    expect(bodies[1]).toMatchObject({ appliedFacets: { [COUNTRY_PARAM]: ['in-id', 'ae-id'] }, offset: 0 })
    expect(bodies.slice(1).map((b) => b.offset)).toEqual([0, 20, 40])
    expect(items).toHaveLength(45)
    const first = items[0]!.normalized as NormalizedJob
    expect(first).toMatchObject({
      companyName: 'Salesforce',
      location: 'India - Hyderabad',
      applyUrl: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site/job/India---Bangalore/Software-Engineer_JR0',
    })
    expect((items[1]!.normalized as NormalizedJob).location).toBe('India - Bangalore')
    expect(headers[0]!.get('user-agent')).toBe(DISCOVERY_USER_AGENT)
  })

  it('reads nothing when the site has a country facet without any target country', async () => {
    mockWorkday(10)
    const items = await new WorkdayAdapter().fetch({ url: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site', countries: 'OM' })
    expect(items).toEqual([])
    expect(bodies).toHaveLength(1)
  })

  it('refuses a non-Workday URL before any request', async () => {
    mockWorkday(1)
    await expect(new WorkdayAdapter().fetch({ url: 'https://example.com/careers' })).rejects.toThrow(/myworkdayjobs/)
    expect(bodies).toHaveLength(0)
  })
})

describe('Workday helpers', () => {
  it('turns "Posted …" into dates', () => {
    const now = new Date('2026-09-27T12:00:00Z')
    expect(postedOnToDate('Posted Today', now)?.toISOString()).toBe('2026-09-27T12:00:00.000Z')
    expect(postedOnToDate('Posted Yesterday', now)?.toISOString()).toBe('2026-09-26T12:00:00.000Z')
    expect(postedOnToDate('Posted 30+ Days Ago', now)?.toISOString()).toBe('2026-08-28T12:00:00.000Z')
    expect(postedOnToDate('whenever', now)).toBeUndefined()
  })

  it('finds a country facet nested under a location group', () => {
    const nested = [{ facetParameter: 'locationMainGroup', values: [{ facetParameter: 'locationCountry', values: [{ descriptor: 'India', id: 'x' }] }] }]
    expect(countryFacet(nested, ['India'])).toEqual({ param: 'locationCountry', ids: ['x'] })
    expect(countryFacet([], ['India'])).toBeNull()
  })
})

describe('WatchAdapter', () => {
  it('never fetches', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy as unknown as typeof globalThis.fetch
    expect(await new WatchAdapter().fetch()).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})
