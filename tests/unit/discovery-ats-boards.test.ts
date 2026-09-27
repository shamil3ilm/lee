import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecruiteeAdapter } from '@/lib/discovery/adapters/recruitee'
import { PinpointAdapter } from '@/lib/discovery/adapters/pinpoint'
import { WorkableAdapter } from '@/lib/discovery/adapters/workable'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'

// Field names from live responses on 2026-09-27; values invented.

let originalFetch: typeof globalThis.fetch
let calls: Array<{ url: string; method: string }>

function mockFetch(handler: (url: string, init?: RequestInit) => Response): void {
  calls = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET' })
    return handler(url, init)
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

describe('RecruiteeAdapter', () => {
  it('normalizes offers from {company}.recruitee.com', async () => {
    mockFetch(() =>
      json({
        offers: [
          {
            id: 2736919, slug: 'backend-engineer', title: 'Backend Engineer', location: 'Riyadh, Riyadh Province, Saudi Arabia',
            country_code: 'SA', remote: false, hybrid: false, on_site: true, careers_url: 'https://jobs.unifonic.com/o/backend-engineer',
            published_at: '2026-09-10 07:25:25 UTC', employment_type_code: 'fulltime_permanent', company_name: 'Unifonic',
          },
        ],
      }),
    )
    const items = await new RecruiteeAdapter().fetch({ company: 'unifonic' })
    expect(calls[0]!.url).toBe('https://unifonic.recruitee.com/api/offers/')
    expect(job(items[0]!)).toMatchObject({
      companyName: 'Unifonic',
      remoteType: 'onsite',
      employmentType: 'fulltime',
      applyUrl: 'https://jobs.unifonic.com/o/backend-engineer',
    })
    expect(job(items[0]!).postedAt?.toISOString()).toBe('2026-09-10T07:25:25.000Z')
  })

  it('only accepts a single DNS label as the slug (it becomes a hostname)', async () => {
    mockFetch(() => json({ offers: [] }))
    await expect(new RecruiteeAdapter().fetch({ company: 'evil.example/x' })).rejects.toThrow()
    await expect(new RecruiteeAdapter().fetch({ company: 'a.b' })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})

describe('PinpointAdapter', () => {
  it('normalizes {company}.pinpointhq.com/postings.json', async () => {
    mockFetch(() =>
      json({
        data: [
          {
            id: '196855', title: 'Senior Backend Engineer.', url: 'https://tabby.pinpointhq.com/en/postings/53c2f99c',
            employment_type: 'full_time', workplace_type: 'onsite', location: { city: 'Riyadh', name: 'Saudi Arabia' },
          },
        ],
      }),
    )
    const items = await new PinpointAdapter().fetch({ company: 'tabby', displayName: 'Tabby' })
    expect(calls[0]!.url).toBe('https://tabby.pinpointhq.com/postings.json')
    expect(job(items[0]!)).toMatchObject({
      title: 'Senior Backend Engineer',
      companyName: 'Tabby',
      location: 'Riyadh, Saudi Arabia',
      remoteType: 'onsite',
      applyUrl: 'https://tabby.pinpointhq.com/en/postings/53c2f99c',
    })
  })
})

describe('WorkableAdapter (widget API)', () => {
  const widget = {
    name: 'Salla',
    jobs: [
      {
        title: 'Backend Developer', shortcode: 'B656D5F0F3', employment_type: 'Full-time', telecommuting: false,
        url: 'https://apply.workable.com/j/B656D5F0F3', published_on: '2026-08-26', country: 'Saudi Arabia', city: 'Riyadh',
        state: 'Riyadh Province', locations: [{ country: 'Saudi Arabia', countryCode: 'SA', city: 'Riyadh' }],
      },
    ],
  }

  it('reads the widget API and uses the account name', async () => {
    mockFetch(() => json(widget))
    const items = await new WorkableAdapter().fetch({ company: 'salla' })
    expect(calls).toEqual([{ url: 'https://www.workable.com/api/accounts/salla?details=false', method: 'GET' }])
    expect(job(items[0]!)).toMatchObject({
      companyName: 'Salla',
      location: 'Riyadh, Riyadh Province, Saudi Arabia',
      applyUrl: 'https://apply.workable.com/j/B656D5F0F3',
      tags: ['country:sa'],
    })
    expect(items[0]!.sourceItemId).toBe('B656D5F0F3')
  })

  it('falls back to v3 when the widget errors, but not for an unknown account', async () => {
    mockFetch((url) => (url.includes('/api/v3/') ? json({ results: [] }) : json({}, 503)))
    await new WorkableAdapter().fetch({ company: 'salla' })
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST'])

    mockFetch(() => json({}, 404))
    await expect(new WorkableAdapter().fetch({ company: 'nope' })).rejects.toThrow(/workable 404/)
    expect(calls).toHaveLength(1)
  })
})
