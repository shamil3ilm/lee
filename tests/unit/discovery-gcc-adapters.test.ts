import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GreenhouseAdapter } from '@/lib/discovery/adapters/greenhouse'
import { WorkableAdapter } from '@/lib/discovery/adapters/workable'
import { RecruiteeAdapter } from '@/lib/discovery/adapters/recruitee'
import { PinpointAdapter } from '@/lib/discovery/adapters/pinpoint'
import { RssAdapter } from '@/lib/discovery/adapters/rss'
import { OracleOrcAdapter, PhenomAdapter, parseSuccessFactorsFeed, sfTitle } from '@/lib/discovery/adapters/enterprise'
import type { DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { parseGccLocation } from '@/lib/discovery/relevance/location'

/**
 * GCC board shapes found in the live audit of 2026-10-08, as small
 * SYNTHETIC payloads (field names and value styles as the boards send
 * them; companies, titles and ids invented).
 */

const job = (i: DiscoveryItem): NormalizedJob => i.normalized as NormalizedJob

let originalFetch: typeof globalThis.fetch
let urls: string[]
function route(handler: (url: string, init?: RequestInit) => unknown): void {
  urls = []
  globalThis.fetch = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u)
    urls.push(url)
    const body = handler(url, init)
    return typeof body === 'string' ? new Response(body, { status: 200 }) : new Response(JSON.stringify(body), { status: 200 })
  }) as typeof globalThis.fetch
}
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('Greenhouse (GCC boards)', () => {
  it('stores escaped HTML as text, uses first_published and the company name, reads work mode', async () => {
    route(() => ({
      jobs: [
        {
          id: 101,
          title: 'Backend Engineer (Hybrid)',
          absolute_url: 'https://job-boards.greenhouse.io/exampleco/jobs/101',
          updated_at: '2026-10-05T04:34:51-04:00',
          first_published: '2026-09-07T04:57:38-04:00',
          company_name: 'ExampleCo',
          location: { name: 'Dubai, United Arab Emirates' },
          content: '&lt;p&gt;Build &lt;b&gt;payments&lt;/b&gt; in PHP &amp;amp; Laravel.&lt;/p&gt;',
        },
      ],
    }))
    const [item] = await new GreenhouseAdapter().fetch({ company: 'exampleco' })
    expect(job(item!)).toMatchObject({
      companyName: 'ExampleCo',
      descriptionMd: 'Build payments in PHP & Laravel.',
      remoteType: 'hybrid',
    })
    expect(job(item!).postedAt?.toISOString()).toBe('2026-09-07T08:57:38.000Z')
    expect(parseGccLocation(job(item!).location)).toMatchObject({ countryCode: 'AE', city: 'Dubai' })
  })
})

describe('Workable (GCC boards)', () => {
  it('asks the widget for details and keeps descriptions and the first location', async () => {
    route(() => ({
      name: 'ExampleCo',
      jobs: [
        {
          title: 'Laravel Developer',
          shortcode: 'ABC123',
          url: 'https://apply.workable.com/j/ABC123',
          published_on: '2026-08-26',
          telecommuting: true,
          locations: [{ country: 'Saudi Arabia', countryCode: 'SA', city: 'Riyadh', region: 'Riyadh Province' }],
          description: '<p>Laravel, MySQL, REST APIs.</p>',
        },
      ],
    }))
    const [item] = await new WorkableAdapter().fetch({ company: 'exampleco' })
    expect(urls[0]).toContain('details=true')
    expect(job(item!)).toMatchObject({
      location: 'Riyadh, Riyadh Province, Saudi Arabia',
      remoteType: 'remote',
      descriptionMd: 'Laravel, MySQL, REST APIs.',
      tags: ['country:sa'],
    })
  })
})

describe('Recruitee and Pinpoint (GCC boards)', () => {
  it('Recruitee: description and requirements become the text', async () => {
    route(() => ({
      offers: [
        {
          id: 7,
          title: 'Software Engineer',
          location: 'Riyadh, Riyadh Province, Saudi Arabia',
          country_code: 'SA',
          on_site: true,
          published_at: '2026-09-10 07:25:25 UTC',
          description: '<p>Messaging APIs.</p>',
          requirements: '<ul><li>Node.js</li></ul>',
        },
      ],
    }))
    const [item] = await new RecruiteeAdapter().fetch({ company: 'exampleco' })
    expect(job(item!).descriptionMd).toBe('Messaging APIs.\n\n- Node.js')
    expect(job(item!).remoteType).toBe('onsite')
  })

  it('Pinpoint: description sections and visible pay', async () => {
    route(() => ({
      data: [
        {
          id: 9,
          title: 'Backend Engineer.',
          url: 'https://exampleco.pinpointhq.com/postings/9',
          workplace_type: 'hybrid',
          location: { city: 'Riyadh', name: 'KSA' },
          description: '<p>Payments platform.</p>',
          key_responsibilities: '<p>Own the ledger.</p>',
          skills_knowledge_expertise: '<p>Go or PHP.</p>',
          compensation_visible: true,
          compensation_minimum: 15000,
          compensation_maximum: 20000,
          compensation_currency: 'SAR',
        },
      ],
    }))
    const [item] = await new PinpointAdapter().fetch({ company: 'exampleco' })
    expect(job(item!)).toMatchObject({
      title: 'Backend Engineer',
      location: 'Riyadh, KSA',
      remoteType: 'hybrid',
      salary: { min: 15000, max: 20000, currency: 'SAR' },
    })
    expect(job(item!).descriptionMd).toContain('Own the ledger.')
  })
})

describe('Oracle Recruiting Cloud details', () => {
  it('reads the full text for thin rows and maps On-site', async () => {
    route((url) =>
      url.includes('recruitingCEJobRequisitionDetails')
        ? { items: [{ ExternalDescriptionStr: '<p>Full posting text about Java and Oracle databases for the Dubai team.</p>' }] }
        : {
            items: [
              {
                TotalJobsCount: 1,
                requisitionList: [
                  { Id: '5001', Title: 'Developer', PostedDate: '2026-10-01', PrimaryLocation: 'Dubai, United Arab Emirates', PrimaryLocationCountry: 'AE', WorkplaceType: 'On-site', ShortDescriptionStr: '' },
                ],
              },
            ],
          },
    )
    const [item] = await new OracleOrcAdapter().fetch({ host: 'abcd.fa.em2.oraclecloud.com', siteNumber: 'CX_1', displayName: 'Example Bank', countries: 'AE' })
    expect(job(item!).descriptionMd).toContain('Java and Oracle databases')
    expect(job(item!).remoteType).toBe('onsite')
    expect(decodeURIComponent(urls[1]!)).toContain('finder=ById;Id="5001",siteNumber=CX_1')
  })

  it('a failed detail read keeps the row', async () => {
    let n = 0
    urls = []
    globalThis.fetch = vi.fn(async () => {
      n += 1
      if (n > 1) return new Response('down', { status: 500 })
      return new Response(JSON.stringify({ items: [{ TotalJobsCount: 1, requisitionList: [{ Id: '1', Title: 'Analyst', PrimaryLocationCountry: 'AE' }] }] }), { status: 200 })
    }) as typeof globalThis.fetch
    const items = await new OracleOrcAdapter().fetch({ host: 'abcd.fa.em2.oraclecloud.com', siteNumber: 'CX_1', displayName: 'X', countries: 'AE' })
    expect(items).toHaveLength(1)
  })
})

describe('SuccessFactors feed (GCC tenants)', () => {
  const feed = `<?xml version="1.0"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
    <item><title>Analyst - Corporate Banking (Abu Dhabi, AE, 939)</title>
      <description><![CDATA[&lt;p&gt;Corporate banking &amp;amp; lending in &lt;b&gt;Abu Dhabi&lt;/b&gt;.&lt;/p&gt;]]></description>
      <link>https://careers.example.ae/job/1/</link><g:id>1</g:id><g:location>Abu Dhabi, AE, 939</g:location><g:job_function>Lending</g:job_function></item>
    <item><title>Accessories Manager | Example Automotive | KSA | Riyadh (SA)</title>
      <description><![CDATA[&lt;p&gt;Lead the accessories team.&lt;/p&gt;]]></description>
      <link>https://careers.example.ae/job/2/</link><g:id>2</g:id><g:location>SA</g:location></item>
  </channel></rss>`

  it('keeps the full description and the city a pipe-style title names', () => {
    const [a, b] = parseSuccessFactorsFeed(feed, 'Example Group')
    expect(job(a!)).toMatchObject({ title: 'Analyst - Corporate Banking', location: 'Abu Dhabi, AE', descriptionMd: 'Corporate banking & lending in Abu Dhabi.' })
    expect(job(b!)).toMatchObject({ title: 'Accessories Manager', location: 'Riyadh, SA', tags: ['ats:successfactors', 'country:sa'] })
    expect(parseGccLocation(job(b!).location)).toMatchObject({ countryCode: 'SA', city: 'Riyadh' })
  })

  it('sfTitle handles both title styles', () => {
    expect(sfTitle('Role (Dubai, AE)')).toEqual({ title: 'Role' })
    expect(sfTitle('Role | Unit | UAE | Dubai (AE)')).toEqual({ title: 'Role', city: 'Dubai' })
    expect(sfTitle('Plain Role')).toEqual({ title: 'Plain Role' })
  })
})

describe('Phenom locale is not a search country', () => {
  it('keeps UAE postings on a site whose locale is "us" (ADNOC)', async () => {
    route(() => ({
      refineSearch: {
        totalHits: 2,
        data: {
          jobs: [
            { jobId: 'A1', title: 'Engineer', location: 'Abu Dhabi, United Arab Emirates', country: 'United Arab Emirates', postedDate: '2026-09-29T00:00:00.000+0000' },
            { jobId: 'A2', title: 'Analyst', location: '', cityStateCountry: 'United Arab Emirates', country: 'United Arab Emirates' },
          ],
        },
      },
    }))
    const items = await new PhenomAdapter().fetch({
      host: 'jobs.example.ae',
      pageId: 'page12',
      displayName: 'Example Energy',
      country: 'us',
      lang: 'en_us',
      pathPrefix: '/us/en',
    })
    expect(items).toHaveLength(2)
    expect(job(items[1]!).location).toBe('United Arab Emirates')
  })
})

describe('Teamtailor RSS', () => {
  it('reads locations, remote status and the company from the channel', async () => {
    route(
      () => `<?xml version="1.0"?><rss version="2.0" xmlns:tt="https://teamtailor.com/locations"><channel><title>Example Retail</title>
        <item><title>Full-stack Engineer</title><description>&lt;p&gt;TypeScript and PHP.&lt;/p&gt;</description>
          <link>https://careers.example.com/jobs/1-full-stack</link><guid>1</guid><pubDate>Mon, 05 Oct 2026 08:00:00 +0400</pubDate>
          <remoteStatus>hybrid</remoteStatus>
          <tt:locations><tt:location><tt:name>Dubai</tt:name><tt:city>Dubai</tt:city><tt:country>United Arab Emirates</tt:country></tt:location>
          <tt:location><tt:name>Riyadh</tt:name><tt:city>Riyadh</tt:city><tt:country>Saudi Arabia</tt:country></tt:location></tt:locations></item>
      </channel></rss>`,
    )
    const [item] = await new RssAdapter().fetch({ url: 'https://careers.example.com/jobs.rss' })
    expect(job(item!)).toMatchObject({
      companyName: 'Example Retail',
      location: 'Dubai, United Arab Emirates; Riyadh, Saudi Arabia',
      remoteType: 'hybrid',
      descriptionMd: 'TypeScript and PHP.',
    })
  })
})
