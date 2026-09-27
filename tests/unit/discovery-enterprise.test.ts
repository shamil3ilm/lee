import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  OracleOrcAdapter,
  PhenomAdapter,
  SuccessFactorsAdapter,
  parseSuccessFactorsFeed,
  safeHost,
} from '@/lib/discovery/adapters/enterprise'
import { locationMatchesCountries } from '@/lib/discovery/search-prefs'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'

// Fixtures: live responses saved on 2026-09-27 (IBS Software ORC, ADCB
// SuccessFactors feed, G42 Phenom), trimmed; one ORC row relocated to the
// US to exercise the country filter.
const fx = (name: string): string => readFileSync(join(__dirname, '../fixtures/enterprise', name), 'utf8')
const job = (i: { normalized: unknown }): NormalizedJob => i.normalized as NormalizedJob

let originalFetch: typeof globalThis.fetch
let requests: Array<{ url: string; init?: RequestInit }>
function serve(body: string, status = 200): void {
  requests = []
  globalThis.fetch = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(u), init })
    return new Response(body, { status })
  }) as typeof globalThis.fetch
}
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('OracleOrcAdapter', () => {
  const config = { host: 'fa-etbm-saasfaprod1.fa.ocs.oraclecloud.com', siteNumber: 'CX_1', displayName: 'IBS Software', countries: 'IN,AE' }

  it('reads requisitions, keeps target countries, builds candidate-experience links', async () => {
    serve(fx('orc.json'))
    const items = await new OracleOrcAdapter().fetch(config)
    expect(items).toHaveLength(2)
    expect(job(items[0]!)).toMatchObject({
      companyName: 'IBS Software',
      location: 'India',
      applyUrl: 'https://fa-etbm-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/2984',
      tags: ['ats:oracle_orc', 'country:in'],
    })
    expect(decodeURIComponent(requests[0]!.url)).toContain('finder=findReqs;siteNumber=CX_1,limit=100,offset=0')
  })

  it('only talks to Oracle Cloud hosts', async () => {
    serve('{}')
    await expect(new OracleOrcAdapter().fetch({ ...config, host: 'evil.example' })).rejects.toThrow(/not allowed/)
    await expect(new OracleOrcAdapter().fetch({ ...config, host: '127.0.0.1' })).rejects.toThrow()
    expect(requests).toHaveLength(0)
  })

  it('an unexpected body is a clear error', async () => {
    serve('{"items":[]}')
    await expect(new OracleOrcAdapter().fetch(config)).rejects.toThrow(/unexpected response/)
  })
})

describe('SuccessFactors job feed', () => {
  it('parses the RSS + g: feed and strips the location suffix from titles', () => {
    const items = parseSuccessFactorsFeed(fx('successfactors.xml'), 'ADCB')
    expect(items).toHaveLength(2)
    expect(items[0]!.sourceItemId).toBe('733436922')
    expect(job(items[0]!)).toMatchObject({
      title: 'Specialist - IT Governance, Risk and Compliance',
      companyName: 'ADCB',
      location: 'Abu Dhabi, AE',
      tags: ['ats:successfactors', 'country:ae'],
    })
    expect(job(items[0]!).applyUrl.startsWith('https://adcbcareers.com/job/')).toBe(true)
  })

  it('reads {host}/sitemal.xml and filters by country', async () => {
    serve(fx('successfactors.xml'))
    expect(await new SuccessFactorsAdapter().fetch({ host: 'adcbcareers.com', displayName: 'ADCB', countries: 'IN' })).toEqual([])
    expect(requests[0]!.url).toBe('https://adcbcareers.com/sitemal.xml')
  })

  it('a page that is not the feed is a clear error', () => {
    expect(() => parseSuccessFactorsFeed('<html><body>Maintenance</body></html>', 'X')).toThrow(/job feed not found/)
  })
})

describe('PhenomAdapter', () => {
  it('posts refineSearch to /widgets and keeps target-country jobs', async () => {
    serve(fx('phenom.json'))
    const items = await new PhenomAdapter().fetch({ host: 'careers.g42.ai', pageId: 'page3', displayName: 'G42', countries: 'AE' })
    expect(requests[0]!.url).toBe('https://careers.g42.ai/widgets')
    const body = JSON.parse(String(requests[0]!.init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({ ddoKey: 'refineSearch', pageId: 'page3', country: 'global', lang: 'en_global', from: 0 })
    expect(items).toHaveLength(2)
    expect(job(items[0]!).applyUrl).toMatch(/^https:\/\/careers\.g42\.ai\/global\/en\/job\/[^/]+\/[A-Za-z0-9-]+$/)
  })

  it('rejects a malformed page id', async () => {
    serve('{}')
    await expect(new PhenomAdapter().fetch({ host: 'careers.g42.ai', pageId: 'x', displayName: 'G42' })).rejects.toThrow()
  })
})

describe('helpers', () => {
  it('safeHost accepts plain hostnames only', () => {
    expect(safeHost('Careers.Example.com')).toBe('careers.example.com')
    expect(() => safeHost('example.com/path')).toThrow()
    expect(() => safeHost('localhost')).toThrow()
  })

  it('locationMatchesCountries uses country names and cities', () => {
    expect(locationMatchesCountries('Bengaluru Millenia', ['IN'])).toBe(true)
    expect(locationMatchesCountries('MBZ City, Abu Dhabi, United Arab Emirates', ['AE'])).toBe(true)
    expect(locationMatchesCountries('Lisbon, Portugal', ['IN', 'AE'])).toBe(false)
    expect(locationMatchesCountries('2 Locations', ['IN'])).toBe(false)
  })
})
