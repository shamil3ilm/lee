import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BambooHrAdapter, bambooLocation, fetchBambooJob, isLocalHire, normalizeBambooListing } from '@/lib/discovery/adapters/bamboohr'
import { getAdapter } from '@/lib/discovery/adapters'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { isListedHost } from '@/lib/net/outbound-hosts'
import { fakeBamboo, type FakeBamboo } from '@/tests/fixtures/bamboohr/serve'

const job = (i: { normalized: unknown }): NormalizedJob => i.normalized as NormalizedJob

let original: typeof globalThis.fetch
let fake: FakeBamboo
beforeEach(() => {
  original = globalThis.fetch
  fake = fakeBamboo()
  globalThis.fetch = fake.fetch
})
afterEach(() => {
  globalThis.fetch = original
})

describe('BambooHR adapter', () => {
  it('is registered and its host is on the outbound list', () => {
    expect(getAdapter('bamboohr')?.kind).toBe('bamboohr')
    expect(isListedHost('aiu.bamboohr.com')).toBe(true)
  })

  it('reads the list, then one detail per opening, and normalises location, status, department and date', async () => {
    const items = await new BambooHrAdapter({ spacingMs: 0 }).fetch({ company: 'aiu', displayName: 'American International University' })
    expect(items).toHaveLength(8)
    const dev = job(items.find((i) => i.sourceItemId === '475')!)
    expect(dev).toMatchObject({
      title: 'Application Developer in Informational Technology (IT)',
      companyName: 'American International University',
      location: 'Jahrah, Kuwait',
      remoteType: 'onsite',
      employmentType: 'unknown',
      applyUrl: 'https://aiu.bamboohr.com/careers/475',
      department: 'Informational Technology (IT)',
      employmentStatus: 'Admin Staff (Local)',
      localHire: true,
    })
    expect(dev.tags).toEqual(expect.arrayContaining(['ats:bamboohr', 'hire:local']))
    expect(dev.postedAt?.toISOString().slice(0, 10)).toBe('2026-08-25')
    expect(dev.descriptionMd).toContain('REST APIs with PHP, Laravel')
    const web = job(items.find((i) => i.sourceItemId === '522')!)
    expect(web).toMatchObject({ title: 'Web Developer & Designer / SEO Specialist', employmentType: 'fulltime' })
    expect(web.localHire).toBeUndefined()
    expect(web.tags).toContain('experience:experienced')
    expect(fake.calls[0]).toBe('https://aiu.bamboohr.com/careers/list')
    expect(fake.calls.filter((c) => c.endsWith('/detail'))).toHaveLength(8)
  })

  it('skips the detail read for openings the source already stored, and caps detail reads per run', async () => {
    const seen = new Set(['446', '464', '494'])
    const items = await new BambooHrAdapter({ spacingMs: 0, detailMax: 3 }).fetch(
      { company: 'aiu' },
      { userId: 'u', seenItemIds: async (ids) => new Set(ids.filter((id) => seen.has(id))) },
    )
    const details = fake.calls.filter((c) => c.endsWith('/detail'))
    expect(details).toHaveLength(3)
    // Newest ids first: 527, 526, 523 get details; 522 and 475 wait for the next run.
    expect(details.map((c) => c.split('/')[4])).toEqual(['527', '526', '523'])
    expect(items.map((i) => i.sourceItemId).sort()).toEqual(['446', '464', '494', '523', '526', '527'])
    expect(job(items.find((i) => i.sourceItemId === '446')!).descriptionMd).toBe('')
  })

  it('reads one opening by id (a link found in a news post)', async () => {
    const item = await fetchBambooJob('aiu', '523', 'American International University')
    expect(job(item!)).toMatchObject({ title: 'Institutional Research Officer', location: 'Jahrah, Kuwait' })
    expect(await fetchBambooJob('aiu', '999', 'AIU')).toBeNull()
  })

  it('rejects a company slug that is not a DNS label', async () => {
    await expect(new BambooHrAdapter().fetch({ company: 'aiu.evil.com/x' })).rejects.toThrow()
  })
})

describe('BambooHR helpers', () => {
  it('local hire is read from the employment status label only', () => {
    expect(isLocalHire('Admin Staff (Local)')).toBe(true)
    expect(isLocalHire('Local Hire')).toBe(true)
    expect(isLocalHire('Full Time')).toBe(false)
    expect(isLocalHire(null)).toBe(false)
  })

  it('builds the location from the ATS location first, without repeats', () => {
    expect(bambooLocation({ location: { city: 'Jahrah', state: 'Kuwait' } })).toBe('Jahrah, Kuwait')
    expect(bambooLocation({ atsLocation: { city: 'Dubai', country: 'United Arab Emirates' }, location: { city: 'Jahrah' } })).toBe('Dubai, United Arab Emirates')
    expect(bambooLocation({ location: { city: 'Kuwait', state: 'Kuwait', addressCountry: 'Kuwait' } })).toBe('Kuwait')
  })

  it('maps locationType to the work mode', () => {
    const base = { id: '1', jobOpeningName: 'Developer' }
    expect(job(normalizeBambooListing({ ...base, locationType: '1' }, 'acme', 'Acme')!).remoteType).toBe('remote')
    expect(job(normalizeBambooListing({ ...base, locationType: '2' }, 'acme', 'Acme')!).remoteType).toBe('hybrid')
    expect(job(normalizeBambooListing({ ...base, isRemote: true }, 'acme', 'Acme')!).remoteType).toBe('remote')
    expect(normalizeBambooListing({ id: '', jobOpeningName: 'x' }, 'acme', 'Acme')).toBeNull()
  })
})
