import { describe, it, expect } from 'vitest'
import { canonicalUrl, extractUrls, linkOnlyBoard, unwrapGoogleLink } from '@/lib/discovery/manual-import/urls'
import { routeLink } from '@/lib/discovery/manual-import/ats-route'

describe('extractUrls', () => {
  it('finds links in prose and Markdown, trimming punctuation and duplicates', () => {
    const text = [
      'Backend Engineer at Example Co (Dubai): https://jobs.lever.co/exampleco/1b2c3d4e-0000-4000-8000-000000000001.',
      '- [Data Analyst](https://boards.greenhouse.io/exampleco/jobs/4567890?gh_src=abc), posted today',
      'Again: https://jobs.lever.co/exampleco/1b2c3d4e-0000-4000-8000-000000000001',
    ].join('\n')
    expect(extractUrls(text).map((f) => f.url)).toEqual([
      'https://jobs.lever.co/exampleco/1b2c3d4e-0000-4000-8000-000000000001',
      'https://boards.greenhouse.io/exampleco/jobs/4567890',
    ])
  })

  it('unwraps google.com/url links offline and drops other Google links (never followed)', () => {
    const text =
      'https://www.google.com/url?q=https%3A%2F%2Fcareers.example.org%2Fjobs%2F42%3Futm_source%3Dx&sa=D ' +
      'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123 ' +
      'https://www.google.com/search?q=backend+jobs'
    expect(extractUrls(text).map((f) => f.url)).toEqual(['https://careers.example.org/jobs/42'])
  })

  it('ignores non-http schemes', () => {
    expect(extractUrls('javascript:alert(1) ftp://example.org/x mailto:a@example.org')).toEqual([])
  })
})

describe('canonicalUrl / unwrapGoogleLink', () => {
  it('normalises host, scheme, tracking params, fragment and trailing slash', () => {
    expect(canonicalUrl('http://WWW.Example.org/Jobs/7/?utm_campaign=a&ref=b&id=3#apply')).toBe('https://example.org/Jobs/7?id=3')
  })

  it('returns null for a Google URL that does not carry its target', () => {
    expect(unwrapGoogleLink(new URL('https://www.google.com/url?q=https://www.google.com/x'))).toBeNull()
    expect(unwrapGoogleLink(new URL('https://example.org/a'))?.toString()).toBe('https://example.org/a')
  })
})

describe('linkOnlyBoard', () => {
  it.each([
    ['https://www.linkedin.com/jobs/view/1234567890', 'LinkedIn'],
    ['https://ae.indeed.com/viewjob?jk=abc', 'Indeed'],
    ['https://www.naukri.com/job-listings-x-123', 'Naukri'],
    ['https://www.naukrigulf.com/x-jid-123456', 'NaukriGulf'],
    ['https://www.bayt.com/en/uae/jobs/x-123/', 'Bayt'],
    ['https://jobs.smartrecruiters.com/Example/123', 'SmartRecruiters'],
  ])('%s is link-only (%s)', (url, board) => {
    expect(linkOnlyBoard(url)).toBe(board)
  })

  it('returns null for an employer site', () => {
    expect(linkOnlyBoard('https://careers.example.org/jobs/1')).toBeNull()
  })
})

describe('routeLink (ATS enrichment routing)', () => {
  it.each([
    ['https://boards.greenhouse.io/exampleco/jobs/4567890', 'greenhouse', { company: 'exampleco' }, '4567890'],
    ['https://job-boards.eu.greenhouse.io/exampleco/jobs/4567890', 'greenhouse', { company: 'exampleco' }, '4567890'],
    ['https://jobs.lever.co/exampleco/1B2C3D4E-0000-4000-8000-000000000001/apply', 'lever', { company: 'exampleco' }, '1b2c3d4e-0000-4000-8000-000000000001'],
    ['https://jobs.ashbyhq.com/exampleco/1b2c3d4e-0000-4000-8000-000000000002', 'ashby', { company: 'exampleco' }, '1b2c3d4e-0000-4000-8000-000000000002'],
    ['https://apply.workable.com/exampleco/j/ab12cd34ef', 'workable', { company: 'exampleco' }, 'AB12CD34EF'],
    [
      'https://exampleco.wd3.myworkdayjobs.com/en-US/External/job/Dubai/Data-Analyst_R123',
      'workday',
      { url: 'https://exampleco.wd3.myworkdayjobs.com/External' },
      '/job/Dubai/Data-Analyst_R123',
    ],
  ])('%s → %s', (url, kind, config, jobKey) => {
    const r = routeLink(url)
    expect(r.type).toBe('ats')
    if (r.type !== 'ats') return
    expect(r.route.kind).toBe(kind)
    expect(r.route.config).toEqual(config)
    expect(r.route.jobKey).toBe(jobKey)
  })

  it('keeps SmartRecruiters as a link (robots.txt disallows its API)', () => {
    expect(routeLink('https://jobs.smartrecruiters.com/ExampleCo/743999')).toEqual({ type: 'link', reason: 'smartrecruiters' })
  })

  it.each([
    'https://www.linkedin.com/jobs/view/1234567890',
    'https://boards.greenhouse.io/exampleco',
    'https://jobs.lever.co/exampleco/not-a-uuid',
    'http://boards.greenhouse.io/exampleco/jobs/4567890',
    'https://careers.example.org/jobs/1',
    'not a url',
  ])('%s is not routed to an ATS', (url) => {
    expect(routeLink(url).type).toBe('link')
  })
})
