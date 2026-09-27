import { describe, expect, it } from 'vitest'
import { resolveJobLink, unresolvedJobClick } from '@/lib/email-alerts/links'
import { alertSendersQuery, hostMatches, siteForHost } from '@/lib/email-alerts/sites'

describe('resolveJobLink', () => {
  it('LinkedIn /comm/jobs/view → canonical /jobs/view, tokens gone', () => {
    const r = resolveJobLink('https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=a&otpToken=secret&midToken=x')
    expect(r).toEqual({ site: 'linkedin', jobKey: '4012345678', url: 'https://www.linkedin.com/jobs/view/4012345678/', canonical: true })
  })

  it('LinkedIn country hosts and currentJobId', () => {
    expect(resolveJobLink('https://ae.linkedin.com/jobs/view/backend-engineer-at-acme-4012345678')?.jobKey).toBe('4012345678')
    expect(resolveJobLink('https://www.linkedin.com/jobs/search/?currentJobId=4012345679')?.jobKey).toBe('4012345679')
  })

  it('Indeed keeps the country host, falls back to www for click hosts', () => {
    expect(resolveJobLink('https://in.indeed.com/rc/clk?jk=ABCDEF0123456789&from=ja')?.url).toBe(
      'https://in.indeed.com/viewjob?jk=abcdef0123456789',
    )
    expect(resolveJobLink('https://click.indeed.com/viewjob?jk=abcdef0123456789')?.url).toBe(
      'https://www.indeed.com/viewjob?jk=abcdef0123456789',
    )
  })

  it('unwraps a click-tracker that carries the target in a query parameter, without fetching it', () => {
    const target = 'https://www.naukri.com/job-listings-backend-developer-acme-pune-2-to-4-years-270926500789?src=alert'
    const wrapped = `https://clicks.mailer.example/track?u=${encodeURIComponent(target)}&id=1`
    expect(resolveJobLink(wrapped)).toMatchObject({
      site: 'naukri',
      jobKey: '270926500789',
      url: 'https://www.naukri.com/job-listings-backend-developer-acme-pune-2-to-4-years-270926500789',
    })
  })

  it('returns null for unknown hosts, listing pages and non-http schemes', () => {
    expect(resolveJobLink('https://evil.example/jobs/view/4012345678')).toBeNull()
    expect(resolveJobLink('https://www.bayt.com/en/uae/jobs/backend-developer-jobs/')).toBeNull()
    expect(resolveJobLink('https://www.gulftalent.com/uae/jobs/title/software-engineer')).toBeNull()
    expect(resolveJobLink('javascript:alert(1)')).toBeNull()
    expect(resolveJobLink('not a url')).toBeNull()
  })

  it('does not treat a look-alike domain as the site', () => {
    expect(resolveJobLink('https://linkedin.com.evil.example/jobs/view/4012345678/')).toBeNull()
    expect(resolveJobLink('https://notlinkedin.com/jobs/view/4012345678/')).toBeNull()
  })
})

describe('unresolvedJobClick', () => {
  it('keeps an id-less Indeed sponsored link, minus tracking params', () => {
    const r = unresolvedJobClick('https://ae.indeed.com/pagead/clk?mo=r&ad=-6NY&tk=1h&from=ja&utm_source=x')
    expect(r).toEqual({ site: 'indeed', url: 'https://ae.indeed.com/pagead/clk?mo=r&ad=-6NY' })
  })

  it('ignores non-job pages and plain http', () => {
    expect(unresolvedJobClick('https://ae.indeed.com/alert/unsubscribe?id=1')).toBeNull()
    expect(unresolvedJobClick('http://ae.indeed.com/pagead/clk?mo=r')).toBeNull()
  })
})

describe('sites', () => {
  it('matches subdomains only on a label boundary', () => {
    expect(hostMatches('match.indeed.com', 'indeed.com')).toBe(true)
    expect(hostMatches('fakeindeed.com', 'indeed.com')).toBe(false)
    expect(siteForHost('www.glassdoor.co.in')?.id).toBe('glassdoor')
  })

  it('builds one Gmail query for every sender domain', () => {
    const q = alertSendersQuery(7)
    expect(q).toContain('linkedin.com')
    expect(q).toContain('naukrigulf.com')
    expect(q.endsWith('newer_than:7d')).toBe(true)
  })
})
