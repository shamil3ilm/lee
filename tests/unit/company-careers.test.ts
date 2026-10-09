import { describe, expect, it } from 'vitest'
import { boardFromUrl, boardSource } from '@/lib/companies/ats-detect'
import { careersPageHash, extractLinks, findCareers } from '@/lib/company-discovery/careers'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import {
  CAREERS_PAGE,
  HOME_WITH_BOARD,
  HOME_WITH_CAREERS_LINK,
  ROBOTS_ALLOW_ALL,
  ROBOTS_DISALLOW_ALL,
  fakeFetch,
} from '@/tests/fixtures/company-discovery'

const deps = (fetchImpl: typeof fetch) => ({ fetchImpl, limiter: NO_WAIT })

describe('board links', () => {
  it('recognises supported boards and maps them to the existing source kinds', () => {
    expect(boardFromUrl('https://jobs.lever.co/dinarpay')).toMatchObject({ kind: 'lever', slug: 'dinarpay', watchable: true })
    expect(boardFromUrl('https://job-boards.greenhouse.io/acme/jobs/123')).toMatchObject({ kind: 'greenhouse', slug: 'acme' })
    expect(boardFromUrl('https://jobs.ashbyhq.com/acme')).toMatchObject({ kind: 'ashby', slug: 'acme' })
    expect(boardFromUrl('https://apply.workable.com/acme/')).toMatchObject({ kind: 'workable', slug: 'acme' })
    expect(boardFromUrl('https://acme.recruitee.com/')).toMatchObject({ kind: 'recruitee', slug: 'acme' })
    expect(boardFromUrl('https://acme.pinpointhq.com/en/jobs')).toMatchObject({ kind: 'pinpoint', slug: 'acme' })
    expect(boardFromUrl('https://acme.wd3.myworkdayjobs.com/en-US/External/job/x')).toMatchObject({ kind: 'workday', slug: 'https://acme.wd3.myworkdayjobs.com/External' })
    expect(boardFromUrl('https://acme.teamtailor.com/jobs')).toMatchObject({ kind: 'teamtailor', slug: 'https://acme.teamtailor.com/jobs.rss' })
    expect(boardFromUrl('https://jobs.smartrecruiters.com/Acme')).toMatchObject({ kind: 'smartrecruiters', watchable: false })
    expect(boardFromUrl('https://acme.example/careers')).toBeNull()
    expect(boardSource(boardFromUrl('https://jobs.lever.co/dinarpay')!)).toEqual({ kind: 'lever', config: { company: 'dinarpay' } })
    expect(boardSource(boardFromUrl('https://acme.teamtailor.com/jobs')!)).toEqual({ kind: 'rss', config: { url: 'https://acme.teamtailor.com/jobs.rss' } })
    expect(boardSource(boardFromUrl('https://jobs.smartrecruiters.com/Acme')!)).toBeNull()
  })

  it('keeps only role addresses on the company domain (no personal emails)', () => {
    const links = extractLinks(HOME_WITH_BOARD, 'https://www.dinarpay.example/', 'dinarpay.example')
    expect(links.emails).toEqual(['careers@dinarpay.example'])
    expect(links.boards[0]).toMatchObject({ kind: 'lever', slug: 'dinarpay' })
  })
})

describe('careers-page finder', () => {
  it('robots.txt disallows the site → no page is fetched at all', async () => {
    const f = fakeFetch([{ match: (u) => u.pathname === '/robots.txt', body: ROBOTS_DISALLOW_ALL, type: 'text/plain' }])
    const r = await findCareers('https://www.dinarpay.example', deps(f))
    expect(r.status).toBe('blocked')
    expect(r.note).toMatch(/robots/)
    expect(f.calls).toEqual(['https://www.dinarpay.example/robots.txt'])
  })

  it('an unreadable robots.txt (5xx) stops before any page', async () => {
    const f = fakeFetch([{ match: (u) => u.pathname === '/robots.txt', status: 503, body: 'down', type: 'text/plain' }])
    const r = await findCareers('https://www.dinarpay.example', deps(f))
    expect(r.status).toBe('blocked')
    expect(f.calls).toHaveLength(1)
  })

  it('finds a job board linked from the homepage, with the role address', async () => {
    const f = fakeFetch([
      { match: (u) => u.pathname === '/robots.txt', body: ROBOTS_ALLOW_ALL, type: 'text/plain' },
      { match: (u) => u.pathname === '/', body: HOME_WITH_BOARD },
    ])
    const r = await findCareers('https://www.dinarpay.example/', deps(f))
    expect(r).toMatchObject({ status: 'found', careersUrl: 'https://jobs.lever.co/dinarpay', emails: ['careers@dinarpay.example'] })
    expect(r.board?.kind).toBe('lever')
    // The board itself is never fetched here (the existing adapter reads its public API).
    expect(f.calls.every((u) => u.startsWith('https://www.dinarpay.example/'))).toBe(true)
  })

  it('follows the homepage careers link and hashes a careers page with no board', async () => {
    const f = fakeFetch([
      { match: (u) => u.pathname === '/robots.txt', body: 'User-agent: *\nDisallow: /admin\n', type: 'text/plain' },
      { match: (u) => u.pathname === '/', body: HOME_WITH_CAREERS_LINK },
      { match: (u) => u.pathname === '/en/join-us', body: CAREERS_PAGE },
    ])
    const r = await findCareers('https://kwdevhouse.example', deps(f))
    expect(r.status).toBe('found')
    expect(r.careersUrl).toBe('https://kwdevhouse.example/en/join-us')
    expect(r.board).toBeNull()
    expect(r.textHash).toMatch(/^[0-9a-f]{16}$/)
    expect(r.emails.sort()).toEqual(['careers@kwdevhouse.example', 'jobs@kwdevhouse.example'])
    expect(await careersPageHash('https://kwdevhouse.example/en/join-us', deps(f))).toBe(r.textHash)
  })

  it('respects a Disallow on the careers path: tries only allowed common paths', async () => {
    const f = fakeFetch([
      { match: (u) => u.pathname === '/robots.txt', body: 'User-agent: *\nDisallow: /careers\nDisallow: /jobs\n', type: 'text/plain' },
      { match: (u) => u.pathname === '/', body: '<html><body>Hello</body></html>' },
    ])
    const r = await findCareers('https://acme.example', deps(f))
    expect(r.status).toBe('none')
    expect(f.calls).not.toContain('https://acme.example/careers')
    expect(f.calls).not.toContain('https://acme.example/jobs')
    expect(f.calls.length).toBeLessThanOrEqual(5)
  })
})
