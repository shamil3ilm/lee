import { describe, expect, it } from 'vitest'
import { BOARD_LABELS, READABLE_BOARD_KINDS, boardFromUrl, boardSource, isReadableBoard, sameBoard } from '@/lib/companies/ats-detect'
import { extractLinks, findCareers } from '@/lib/company-discovery/careers'
import { NO_WAIT } from '@/lib/reputation/rate-limit'
import { getAdapter } from '@/lib/discovery/adapters'

describe('board links: every ATS the auto-detect recognises', () => {
  it.each([
    ['https://aiu.bamboohr.com/careers', 'bamboohr', 'aiu', true],
    ['https://aiu.bamboohr.com/careers/479', 'bamboohr', 'aiu', true],
    ['https://aiu.bamboohr.com/jobs/embed2.php', 'bamboohr', 'aiu', true],
    ['https://boards.greenhouse.io/embed/job_board/js?for=acme', 'greenhouse', 'acme', true],
    ['https://jobs.lever.co/acme/0b1c2d3e-1111-2222-3333-444455556666', 'lever', 'acme', true],
    ['https://jobs.ashbyhq.com/acme', 'ashby', 'acme', true],
    ['https://apply.workable.com/acme/j/ABC123/', 'workable', 'acme', true],
    ['https://acme.recruitee.com/o/backend-developer', 'recruitee', 'acme', true],
    ['https://acme.teamtailor.com/jobs', 'teamtailor', 'https://acme.teamtailor.com/jobs.rss', true],
    ['https://eiby.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1234', 'oracle_orc', 'eiby.fa.em2.oraclecloud.com/CX_1', true],
    ['https://jobs.smartrecruiters.com/Acme', 'smartrecruiters', 'Acme', false],
    ['https://acme.jobs.personio.de/', 'personio', 'acme', false],
    ['https://careers.acme.zohorecruit.com/jobs/Careers', 'zoho', 'careers.acme.zohorecruit.com', false],
    ['https://lde.tbe.taleo.net/lde01/ats/careers/v2/searchResults?org=ACME', 'taleo', 'lde.tbe.taleo.net', false],
    ['https://career2.successfactors.eu/career?company=daralshifa', 'successfactors', 'career2.successfactors.eu', false],
    ['https://careers-acme.icims.com/jobs', 'icims', 'careers-acme.icims.com', false],
    ['https://acme.applytojob.com/apply', 'jazzhr', 'acme.applytojob.com', false],
    ['https://acme.breezy.hr/', 'breezy', 'acme.breezy.hr', false],
    ['https://acme.freshteam.com/jobs', 'freshteam', 'acme.freshteam.com', false],
    ['https://www.careers-page.com/acme', 'manatal', 'www.careers-page.com', false],
  ] as const)('%s → %s', (url, kind, slug, readable) => {
    expect(boardFromUrl(url)).toMatchObject({ kind, slug, watchable: readable })
  })

  it('names the one opening a link points at', () => {
    expect(boardFromUrl('https://aiu.bamboohr.com/careers/479')?.jobId).toBe('479')
    expect(boardFromUrl('https://aiu.bamboohr.com/jobs/view.php?id=55')?.jobId).toBe('55')
    expect(boardFromUrl('https://boards.greenhouse.io/acme/jobs/4012345')?.jobId).toBe('4012345')
    expect(boardFromUrl('https://apply.workable.com/acme/j/abc123/')?.jobId).toBe('ABC123')
    expect(boardFromUrl('https://aiu.bamboohr.com/careers')?.jobId).toBeUndefined()
  })

  it('every readable kind has an adapter, a label and a source config', () => {
    for (const k of READABLE_BOARD_KINDS) expect(BOARD_LABELS[k], k).toBeTruthy()
    for (const k of ['greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'pinpoint', 'workday', 'bamboohr', 'oracle_orc']) expect(getAdapter(k), k).not.toBeNull()
    expect(isReadableBoard('smartrecruiters')).toBe(false)
    expect(boardSource(boardFromUrl('https://aiu.bamboohr.com/careers')!, 'American International University')).toEqual({
      kind: 'bamboohr',
      config: { company: 'aiu', displayName: 'American International University' },
    })
    expect(boardSource(boardFromUrl('https://eiby.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1')!, 'NMC Healthcare')).toEqual({
      kind: 'oracle_orc',
      config: { host: 'eiby.fa.em2.oraclecloud.com', siteNumber: 'CX_1', displayName: 'NMC Healthcare' },
    })
    expect(boardSource(boardFromUrl('https://acme.jobs.personio.de/')!)).toBeNull()
  })

  it('sameBoard compares the board identity, not the display name', () => {
    const src = boardSource(boardFromUrl('https://aiu.bamboohr.com/careers/1')!, 'AIU')!
    expect(sameBoard(src, 'bamboohr', { company: 'AIU', displayName: 'Other name' })).toBe(true)
    expect(sameBoard(src, 'bamboohr', { company: 'absedu' })).toBe(false)
    expect(sameBoard(src, 'lever', { company: 'aiu' })).toBe(false)
  })
})

describe('careers pages: a board one link deeper', () => {
  it('follows "About › Careers" to the page that embeds the BambooHR widget (robots first, page cap kept)', async () => {
    const pages: Record<string, string> = {
      '/robots.txt': 'User-agent: *\nDisallow: /academics/private/',
      '/': '<html><body><a href="/about/careers">Careers</a></body></html>',
      '/about/careers': '<html><head><title>Careers at AIU</title></head><body><h1>Join AIU</h1><a href="/careers/jobs">Current vacancies</a></body></html>',
      '/careers/jobs': '<html><body><div id="BambooHR"></div><script src="https://aiu.bamboohr.com/js/embed.js"></script></body></html>',
    }
    const calls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const u = new URL(String(input))
      calls.push(u.pathname)
      const body = pages[u.pathname]
      return body ? new Response(body, { status: 200, headers: { 'content-type': u.pathname.endsWith('.txt') ? 'text/plain' : 'text/html' } }) : new Response('', { status: 404 })
    }) as typeof fetch
    const r = await findCareers('https://www.aiu.edu.kw', { fetchImpl, limiter: NO_WAIT })
    expect(r).toMatchObject({ status: 'found', board: { kind: 'bamboohr', slug: 'aiu' } })
    expect(calls).toEqual(['/robots.txt', '/', '/about/careers', '/careers/jobs'])
  })
})

describe('careers pages: embedded boards', () => {
  it('finds a BambooHR embed script and an iframe, and board URLs in inline scripts', () => {
    const html = `<html><body>
      <div id="BambooHR" data-domain="aiu.bamboohr.com"></div>
      <script src="https://aiu.bamboohr.com/js/embed.js" type="text/javascript" async defer></script>
      <iframe src="https://acme.teamtailor.com/jobs"></iframe>
      <script>window.board = "https://boards.greenhouse.io/embed/job_board?for=acme2"</script>
    </body></html>`
    const links = extractLinks(html, 'https://www.aiu.edu.kw/careers/jobs', 'aiu.edu.kw')
    expect(links.boards.map((b) => `${b.kind}:${b.slug}`)).toEqual(['bamboohr:aiu', 'teamtailor:https://acme.teamtailor.com/jobs.rss', 'greenhouse:acme2'])
  })
})
