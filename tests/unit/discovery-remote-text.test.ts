import { describe, expect, it } from 'vitest'
import { normalizeRemotiveJob } from '@/lib/discovery/adapters/remotive'
import { normalizeWorkingNomadsJob } from '@/lib/discovery/adapters/workingnomads'
import { parseWwrFeed } from '@/lib/discovery/adapters/weworkremotely'
import { normalizeHimalayasJob } from '@/lib/discovery/adapters/himalayas'
import { normalizeJobicyJob } from '@/lib/discovery/adapters/jobicy'
import type { DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'

/**
 * Remote boards must hand the gate the eligibility text ("US only",
 * "relocation package", a UTC window). Until 2026-10-08 Remotive, Working
 * Nomads and We Work Remotely stored no description and Himalayas / Jobicy
 * only a one-line excerpt. Payloads are SYNTHETIC, shaped like each API.
 */
const job = (i: DiscoveryItem | null): NormalizedJob => i!.normalized as NormalizedJob

describe('remote boards keep their description text', () => {
  it('Remotive: description and salary', () => {
    const j = job(
      normalizeRemotiveJob({
        id: 1,
        url: 'https://remotive.com/remote-jobs/software-dev/backend-1',
        title: 'Backend Engineer',
        company_name: 'ExampleCo',
        candidate_required_location: 'USA',
        salary: '$90k - $120k',
        description: '<p>Remote, <b>US only</b>. Relocation package available.</p>',
      }),
    )
    expect(j.location).toBe('Remote (USA)')
    expect(j.descriptionMd).toBe('Salary: $90k - $120k\nRemote, US only. Relocation package available.')
  })

  it('Working Nomads: description', () => {
    const j = job(
      normalizeWorkingNomadsJob({
        url: 'https://www.workingnomads.com/jobs/1',
        title: 'ExampleCo - PHP Developer',
        company_name: 'ExampleCo',
        category_name: 'Development',
        location: 'APAC',
        description: '<p>Hiring in APAC, UTC+5:30 preferred.</p>',
      }),
    )
    expect(j.title).toBe('PHP Developer')
    expect(j.descriptionMd).toBe('Hiring in APAC, UTC+5:30 preferred.')
  })

  it('We Work Remotely: escaped description', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item>
      <title>ExampleCo: Laravel Developer</title><link>https://weworkremotely.com/remote-jobs/example-laravel</link>
      <region>Anywhere in the World</region><pubDate>Mon, 05 Oct 2026 10:00:00 +0000</pubDate>
      <description>&lt;p&gt;Work from home anywhere; &lt;strong&gt;India welcome&lt;/strong&gt;.&lt;/p&gt;</description>
    </item></channel></rss>`
    const [item] = parseWwrFeed(xml)
    expect(job(item!).descriptionMd).toBe('Work from home anywhere; India welcome.')
  })

  it('Himalayas: full description and the timezone window', () => {
    const j = job(
      normalizeHimalayasJob({
        title: 'Full Stack Developer',
        companyName: 'ExampleCo',
        guid: 'https://himalayas.app/companies/example/jobs/1',
        excerpt: 'Short.',
        description: '<p>Build the billing platform.</p>',
        locationRestrictions: ['India', 'United Arab Emirates'],
        timezoneRestrictions: [5.5, 4],
      }),
    )
    expect(j.descriptionMd).toBe('Timezones: UTC+5:30, UTC+4\nBuild the billing platform.')
    expect(j.location).toBe('Remote (India, United Arab Emirates)')
  })

  it('Jobicy: the full jobDescription over the excerpt', () => {
    const j = job(
      normalizeJobicyJob({
        id: 2,
        url: 'https://jobicy.com/jobs/2-backend',
        jobTitle: 'Backend Developer',
        companyName: 'ExampleCo',
        jobGeo: 'EMEA',
        jobExcerpt: 'Short.',
        jobDescription: '<p>Remote within EMEA; visa and relocation support for Dubai.</p>',
      }),
    )
    expect(j.descriptionMd).toBe('Remote within EMEA; visa and relocation support for Dubai.')
  })
})
