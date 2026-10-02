import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { companyAndLocation, parseAlertEmail, parseAlertHtml, parseAlertText } from '@/lib/email-alerts/parse'

// Fixtures are SYNTHETIC (see tests/fixtures/email-alerts/README.md).
const fx = (name: string): string => readFileSync(join(__dirname, '../fixtures/email-alerts', name), 'utf8')

describe('parseAlertHtml — LinkedIn', () => {
  const jobs = parseAlertHtml('linkedin', fx('linkedin.html'))

  it('finds each job card once, ignoring search / manage / unsubscribe links', () => {
    expect(jobs.map((j) => j.jobKey)).toEqual(['4012345678', '4012345699', '4012345700'])
  })

  it('reads title, company and location from "Company · Location"', () => {
    expect(jobs[0]).toMatchObject({
      site: 'linkedin',
      title: 'Backend Engineer (Go)',
      company: 'Careem',
      location: 'Dubai, United Arab Emirates (Hybrid)',
    })
    expect(jobs[1]).toMatchObject({ title: 'Full Stack Developer', company: 'Tabby', location: 'Riyadh, Saudi Arabia (On-site)' })
    expect(jobs[2]).toMatchObject({ title: 'Junior Software Engineer, Payments', company: 'Property Finder' })
  })

  it('stores the canonical posting URL and drops recipient tokens', () => {
    expect(jobs[0]!.url).toBe('https://www.linkedin.com/jobs/view/4012345678/')
    expect(jobs[0]!.canonical).toBe(true)
    for (const j of jobs) expect(j.url).not.toMatch(/otpToken|midToken|trackingId/i)
  })
})

describe('parseAlertText — LinkedIn plain-text part', () => {
  it('reads title / company / location blocks ending in "View job: <url>"', () => {
    const jobs = parseAlertText('linkedin', fx('linkedin.txt'))
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      jobKey: '4099000001',
      title: 'Senior Full Stack Engineer',
      company: 'Razorpay',
      location: 'Bengaluru, Karnataka, India',
      url: 'https://www.linkedin.com/jobs/view/4099000001/',
    })
    expect(jobs[1]).toMatchObject({ title: 'Backend Developer (Node.js)', company: 'Swiggy' })
  })
})

describe('parseAlertHtml — Indeed', () => {
  const jobs = parseAlertHtml('indeed', fx('indeed.html'))

  it('rebuilds viewjob URLs from jk on the country host', () => {
    expect(jobs[0]).toMatchObject({
      jobKey: '0a1b2c3d4e5f6071',
      title: 'Backend Developer',
      company: 'Noon',
      location: 'Dubai',
      url: 'https://ae.indeed.com/viewjob?jk=0a1b2c3d4e5f6071',
      canonical: true,
    })
    expect(jobs[1]).toMatchObject({ title: 'Full Stack Engineer - Python/React', company: 'Kitopi', location: 'Remote in Dubai' })
  })

  it('keeps a sponsored link without a job key as a cleaned raw link, keyed by title + company', () => {
    const sponsored = jobs.find((j) => j.title === 'Software Engineer (Mid-level)')
    expect(sponsored).toBeDefined()
    expect(sponsored!.canonical).toBe(false)
    expect(sponsored!.jobKey).toMatch(/^h-[0-9a-f]{20}$/)
    expect(sponsored!.url.startsWith('https://ae.indeed.com/pagead/clk?')).toBe(true)
    expect(sponsored!.url).not.toMatch(/[?&](tk|from)=/)
  })

  it('text part yields the same keys', () => {
    const text = parseAlertText('indeed', fx('indeed.txt'))
    expect(text.map((j) => j.jobKey)).toEqual(['0a1b2c3d4e5f6071', '1122334455667788'])
    expect(text[0]).toMatchObject({ company: 'Noon', location: 'Dubai' })
  })
})

describe('parseAlertHtml — Gulf and India sites', () => {
  it('Naukri: skips experience / salary / skills lines', () => {
    const jobs = parseAlertHtml('naukri', fx('naukri.html'))
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      jobKey: '270926500123',
      title: 'Backend Developer',
      company: 'Freshworks',
      location: 'Chennai, Bengaluru',
      url: 'https://www.naukri.com/job-listings-backend-developer-freshworks-chennai-2-to-5-years-270926500123',
    })
    expect(jobs[1]).toMatchObject({ company: 'Zerodha', location: 'Bengaluru' })
  })

  it('NaukriGulf: <br>-separated lines', () => {
    const jobs = parseAlertHtml('naukrigulf', fx('naukrigulf.html'))
    expect(jobs.map((j) => [j.jobKey, j.title, j.company, j.location])).toEqual([
      ['260926000111', 'Full Stack Developer', 'Talabat', 'Dubai - UAE'],
      ['260926000222', 'Backend Engineer', 'Salla', 'Riyadh - Saudi Arabia'],
    ])
    expect(jobs[0]!.url).toBe(
      'https://www.naukrigulf.com/full-stack-developer-jobs-in-dubai-uae-in-talabat-2-to-5-years-n-cd-100200-jid-260926000111',
    )
  })

  it('Bayt: "Company - City, Country" and no listing pages', () => {
    const jobs = parseAlertHtml('bayt', fx('bayt.html'))
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      jobKey: '4987654',
      company: 'Snoonu',
      location: 'Doha, Qatar',
      url: 'https://www.bayt.com/en/qatar/jobs/backend-developer-4987654/',
    })
  })

  it('GulfTalent: ignores /jobs/title/… listing links', () => {
    const jobs = parseAlertHtml('gulftalent', fx('gulftalent.html'))
    expect(jobs.map((j) => [j.jobKey, j.company, j.location])).toEqual([
      ['431122', 'Omantel', 'Muscat, Oman'],
      ['431155', 'Tarabut', 'Manama, Bahrain'],
    ])
    expect(jobs[0]!.url).toBe('https://www.gulftalent.com/oman/jobs/software-engineer-backend-431122')
  })

  it('Glassdoor: listing and partner links', () => {
    const jobs = parseAlertHtml('glassdoor', fx('glassdoor.html'))
    expect(jobs).toHaveLength(2)
    expect(jobs[0]!.url).toBe(
      'https://www.glassdoor.com/job-listing/backend-engineer-tamara-JV_IC2204498_KO0,16_KE17,23.htm?jl=1010999888777',
    )
    expect(jobs[1]).toMatchObject({
      jobKey: '1010999888000',
      company: 'Anghami',
      location: 'Abu Dhabi',
      url: 'https://www.glassdoor.com/partner/jobListing.htm?jobListingId=1010999888000',
    })
  })
})

describe('parseAlertEmail', () => {
  it('falls back to the text part when the HTML has no jobs', () => {
    const jobs = parseAlertEmail({ site: 'linkedin', html: '<p>nothing here</p>', text: fx('linkedin.txt') })
    expect(jobs).toHaveLength(2)
  })

  it('returns nothing for a non-alert email from the same domain', () => {
    const html = '<p>You have a new message. <a href="https://www.linkedin.com/messaging/thread/123/">Reply</a></p>'
    expect(parseAlertEmail({ site: 'linkedin', html })).toEqual([])
  })

  it('never takes a job from another site than the sender', () => {
    const html = '<a href="https://www.naukri.com/job-listings-x-270926500999">Backend Dev</a><div>Acme</div>'
    expect(parseAlertEmail({ site: 'linkedin', html })).toEqual([])
  })

  it('survives garbage input', () => {
    expect(parseAlertEmail({ site: 'indeed', html: '<<<>>><a href=javascript:alert(1)>x</a>', text: 'jk=' })).toEqual([])
    expect(parseAlertEmail({ site: 'indeed' })).toEqual([])
  })
})

describe('companyAndLocation', () => {
  it('splits "Company - Location"', () => {
    expect(companyAndLocation(['Acme - Dubai'])).toEqual({ company: 'Acme', location: 'Dubai' })
  })
  it('keeps a company whose name starts with a place', () => {
    expect(companyAndLocation(['Dubai Holding', 'Dubai, United Arab Emirates'])).toEqual({
      company: 'Dubai Holding',
      location: 'Dubai, United Arab Emirates',
    })
  })
})
