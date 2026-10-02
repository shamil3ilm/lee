import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  InfoparkAdapter,
  PortalLayoutError,
  TechnoparkAdapter,
  parseCyberpark,
  parseDmy,
  parseInfopark,
  parseKsum,
  parseTechnopark,
  parseUlCyberpark,
} from '@/lib/discovery/adapters/kerala-parks'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'

// Fixtures: real public pages / API responses saved on 2026-09-27, trimmed.
const fx = (name: string): string => readFileSync(join(__dirname, '../fixtures/kerala', name), 'utf8')
const job = (i: { normalized: unknown }): NormalizedJob => i.normalized as NormalizedJob

let originalFetch: typeof globalThis.fetch
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('Technopark', () => {
  it('reads the paginated jobs API', () => {
    const items = parseTechnopark(JSON.parse(fx('technopark.json')))
    expect(items).toHaveLength(3)
    expect(items[0]!.sourceItemId).toBe('33184')
    expect(job(items[0]!)).toMatchObject({
      title: 'Management Trainee (walk-in 2026-09-28)',
      companyName: 'SCALEVEL TECHNOLOGIES',
      applyUrl: 'https://technopark.in/job-details/33184',
      location: 'Technopark, Thiruvananthapuram, Kerala, India',
      tags: ['park:technopark', 'country:in'],
    })
    expect(job(items[0]!).postedAt?.toISOString().slice(0, 10)).toBe('2026-09-26')
  })

  it('stops at last_page and caps pages', async () => {
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (u: RequestInfo | URL) => {
      urls.push(String(u))
      return new Response(JSON.stringify({ data: [], last_page: 99 }), { status: 200 })
    }) as typeof globalThis.fetch
    await new TechnoparkAdapter().fetch()
    expect(urls).toHaveLength(TechnoparkAdapter.MAX_PAGES)
  })

  it('a changed API shape is a clear layout error', () => {
    expect(() => parseTechnopark({} as never)).toThrow(PortalLayoutError)
  })
})

describe('Infopark', () => {
  it('reads the job table', () => {
    const items = parseInfopark(fx('infopark.html'))
    expect(items).toHaveLength(3)
    expect(items[0]!.sourceItemId).toBe('25745')
    expect(job(items[0]!)).toMatchObject({
      title: 'Legal Content Specialist (LLB)',
      companyName: 'Mozilor Technologies Pvt. Ltd.',
      applyUrl: 'https://infopark.in/company-jobs/details/333/25745',
    })
    expect(job(items[0]!).postedAt?.toISOString().slice(0, 10)).toBe('2026-09-27')
  })

  it('throws a clear error when the table is gone; HTTP errors propagate', async () => {
    expect(() => parseInfopark('<html><body>Maintenance</body></html>')).toThrow(/infopark: job table .* not found/)
    globalThis.fetch = vi.fn(async () => new Response('', { status: 503 })) as typeof globalThis.fetch
    await expect(new InfoparkAdapter().fetch()).rejects.toThrow(/infopark 503/)
  })
})

describe('Kerala Cyberpark', () => {
  it('reads WP Job Manager listings', () => {
    const items = parseCyberpark(JSON.parse(fx('cyberpark.json')))
    expect(items.length).toBe(3)
    const ux = items.find((i) => i.sourceItemId === '12189')!
    expect(job(ux)).toMatchObject({ title: 'UI/UX Designer', companyName: 'Northmetrix Pvt Ltd' })
    expect(job(ux).applyUrl.startsWith('https://cyberparks.in/job/')).toBe(true)
    expect(job(ux).postedAt?.toISOString().slice(0, 10)).toBe('2026-09-24')
  })
})

describe('UL Cyberpark', () => {
  it('reads the table, ignoring the broken company links', () => {
    const items = parseUlCyberpark(fx('ulcyberpark.html'))
    expect(items).toHaveLength(3)
    expect(job(items[0]!).applyUrl).toMatch(/^https:\/\/www\.ulcyberpark\.com\/jobs\/job_vacancy\?job_id=\d+$/)
    expect(job(items[0]!).companyName).not.toMatch(/http|@/)
    expect((items[0]!.raw as { closing?: string }).closing?.slice(0, 10)).toBe('2026-09-30')
  })
})

describe('KSUM', () => {
  it('reads KSUM careers', () => {
    const items = parseKsum(JSON.parse(fx('ksum.json')))
    expect(items.map((i) => i.sourceItemId)).toEqual([
      'manager-fab-lab-6a94f67c898e1',
      'assistant-manager-iedc-6a94fb804acea',
      'intern-infra-electrical-6a94ffc9567bc',
    ])
    expect(job(items[2]!)).toMatchObject({
      title: 'Intern - Infra (Electrical) (Internship)',
      companyName: 'Kerala Startup Mission',
      applyUrl: 'https://startupmission.kerala.gov.in/career/intern-infra-electrical-6a94ffc9567bc',
    })
  })
})

describe('parseDmy', () => {
  it('parses DD-MM-YYYY', () => {
    expect(parseDmy('closing date: 30-09-2026')?.toISOString()).toBe('2026-09-30T00:00:00.000Z')
    expect(parseDmy('soon')).toBeUndefined()
  })
})
