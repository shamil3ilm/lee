import { describe, expect, it } from 'vitest'
import { parseTechnoparkCompanies, parseTechnoparkProfile, isParkProfileUrl } from '@/lib/company-discovery/sources/technopark'
import { parseCyberparkPage, parseInfoparkPage, parseUlCyberparkPage, siteUrl } from '@/lib/company-discovery/sources/kerala-parks'
import { countryRegion, parseFlat6labsCompany, parseFlat6labsSitemap, parseStartupBahrain } from '@/lib/company-discovery/sources/accelerators'
import { parseNasscomPage } from '@/lib/company-discovery/sources/nasscom'
import { searchLastPage, orgSearchUrl } from '@/lib/company-discovery/sources/github'
import { directoriesFor } from '@/lib/company-discovery/sources/registry'
import { parseCursors, walkPages } from '@/lib/company-discovery/cursors'
import {
  CYBERPARK_PAGE,
  FLAT6LABS_SITEMAP,
  INFOPARK_PAGE_1,
  NASSCOM_PAGE,
  STARTUP_BAHRAIN_PAGE,
  TECHNOPARK_PAGES,
  UL_CYBERPARK_PAGE,
  flat6labsCompany,
  technoparkProfile,
} from '@/tests/fixtures/company-discovery/recall'

describe('Technopark list and profile', () => {
  it('keeps active companies with their profile page, and the last page', () => {
    const p1 = parseTechnoparkCompanies(TECHNOPARK_PAGES[1])
    expect(p1.lastPage).toBe(3)
    expect(p1.companies.map((c) => c.name)).toEqual(['Alpha Example Systems (P) Ltd', 'Beta Example Labs (P) Ltd'])
    expect(p1.companies[0]).toMatchObject({ regionIds: ['thiruvananthapuram'], sourceTags: ['directory:technopark'], evidence: { profileUrl: 'https://technopark.in/company-details/101' } })
  })

  it('reads the website from the profile page, and only Technopark profile URLs count', () => {
    expect(parseTechnoparkProfile(technoparkProfile('QBurst Technologies (P) Ltd', 'http://www.qburst.com'))).toBe('http://www.qburst.com')
    expect(parseTechnoparkProfile(technoparkProfile('No Site Example', null))).toBeNull()
    expect(isParkProfileUrl('https://technopark.in/company-details/6254')).toBe(true)
    expect(isParkProfileUrl('https://technopark.in/company-details/../admin')).toBe(false)
    expect(isParkProfileUrl('https://evil.example/company-details/1')).toBe(false)
  })
})

describe('Infopark, Kerala Cyberpark and UL Cyberpark parsers', () => {
  it('Infopark: name, website, domain tags → industries, Kochi; e-mails in comments are never read', () => {
    const r = parseInfoparkPage(INFOPARK_PAGE_1)
    expect(r.lastPage).toBe(3)
    expect(r.companies.map((c) => c.name)).toEqual(['Backwater Payments Example Pvt Ltd', 'QBurst Technologies', 'Kayal Data Example'])
    expect(r.companies[0]).toMatchObject({ website: 'https://www.backwaterpay.example', regionIds: ['kochi'], sourceTags: ['directory:infopark'] })
    expect(r.companies[0]!.industries).toEqual(expect.arrayContaining(['fintech', 'software']))
    expect(r.companies[2]).toMatchObject({ website: undefined, industries: ['data'] })
    expect(JSON.stringify(r.companies)).not.toContain('hidden.example')
  })

  it('Cyberpark: cards with a website; empty cards are skipped', () => {
    const r = parseCyberparkPage(CYBERPARK_PAGE)
    expect(r.companies).toHaveLength(1)
    expect(r.companies[0]).toMatchObject({ name: 'Malabar Code Example Private Limited', website: 'https://www.malabarcode.example', regionIds: ['kozhikode'], evidence: { listedAt: 'https://cyberparks.in/listings/malabar-code-example/' } })
  })

  it('UL Cyberpark: linked cards in Kozhikode', () => {
    expect(parseUlCyberparkPage(UL_CYBERPARK_PAGE).companies.map((c) => [c.name, c.website])).toEqual([
      ['QBURST', 'https://www.qburst.com'],
      ['Calicut Soft Example', 'https://www.calicutsoft.example'],
    ])
  })

  it('a redesigned page yields nothing rather than invented companies', () => {
    expect(parseInfoparkPage('<html><body><h5>Not a card</h5></body></html>').companies).toEqual([])
    expect(parseCyberparkPage('<html></html>').companies).toEqual([])
    expect(parseUlCyberparkPage('<a href="https://x.example">x</a>').companies).toEqual([])
    expect(siteUrl('mailto:a@b.example')).toBeUndefined()
    expect(siteUrl('www.Foo-Bar.example/careers')).toBe('https://www.foo-bar.example')
  })
})

describe('accelerators and member lists', () => {
  it('Flat6Labs: one URL per slug (English first), GCC companies only', () => {
    expect(parseFlat6labsSitemap(FLAT6LABS_SITEMAP)).toEqual(['https://flat6labs.com/fr/Company/cairo-crafts/', 'https://flat6labs.com/Company/riyadh-ledger/'])
    const c = parseFlat6labsCompany(flat6labsCompany('Riyadh Ledger Example', 'KSA', 'http://www.riyadhledger.example'), 'https://flat6labs.com/Company/riyadh-ledger/')
    expect(c).toMatchObject({ name: 'Riyadh Ledger Example', website: 'http://www.riyadhledger.example', regionIds: ['sa'], sourceTags: ['directory:flat6labs'] })
    expect(parseFlat6labsCompany(flat6labsCompany('Cairo Crafts Example', 'Égypte', 'https://cc.example'), 'u')).toBeNull()
    expect(countryRegion('Émirats arabes unis')).toBe('ae')
  })

  it('StartUp Bahrain: the Startups section only, deduped, no "Submit" row', () => {
    expect(parseStartupBahrain(STARTUP_BAHRAIN_PAGE).map((c) => [c.name, c.website, c.regionIds])).toEqual([['Pearl Pay Example', 'https://pearlpay.example/', ['bh']]])
  })

  it('NASSCOM: name, city → region, website; the next link drives the cursor', () => {
    const r = parseNasscomPage(NASSCOM_PAGE)
    expect(r.hasNext).toBe(true)
    expect(r.companies.map((c) => [c.name, c.regionIds[0], c.website])).toEqual([
      ['Lagoon Logic Example Private Limited', 'kochi', 'https://lagoonlogic.example/'],
      ['Deccan Cloud Example Limited', 'hyderabad', 'https://deccancloud.example/'],
    ])
  })

  it('switches directories on by the target places', () => {
    expect(directoriesFor(new Set(['kochi', 'thiruvananthapuram'])).map((d) => d.id)).toEqual(['technopark', 'infopark', 'nasscom'])
    expect(directoriesFor(new Set(['kozhikode'])).map((d) => d.id)).toEqual(['cyberpark', 'ul-cyberpark', 'nasscom'])
    expect(directoriesFor(new Set(['bh'])).map((d) => d.id)).toEqual(['startup-bahrain', 'flat6labs'])
  })
})

describe('cursor walks (incremental ingestion)', () => {
  const pages = (last: number) => async (p: number) => ({ items: [`p${p}`], lastPage: last })

  it('reads every page in one run when the budget allows, then wraps with a completed pass', async () => {
    const now = new Date('2026-10-09T00:00:00Z')
    const r = await walkPages(undefined, 30, pages(3), { now })
    expect(r.items).toEqual(['p1', 'p2', 'p3'])
    expect(r.cursor).toEqual({ next: 1, lastPage: 3, completedAt: now.toISOString() })
  })

  it('resumes where the last run stopped and never reads a page twice in a run', async () => {
    const first = await walkPages(undefined, 2, pages(5))
    expect(first.items).toEqual(['p1', 'p2'])
    const second = await walkPages(first.cursor, 10, pages(5))
    expect(second.items).toEqual(['p3', 'p4', 'p5', 'p1', 'p2'])
    expect(second.cursor.next).toBe(3)
  })

  it('a failing page keeps the cursor on it for the next run', async () => {
    const r = await walkPages({ next: 2 }, 5, async (p) => {
      if (p === 3) throw new Error('HTTP 503')
      return { items: [p], lastPage: 4 }
    })
    expect(r.items).toEqual([2])
    expect(r.cursor.next).toBe(3)
    expect(r.error).toBe('HTTP 503')
  })

  it('stops when time runs out, and parses stored cursors leniently', async () => {
    const r = await walkPages(undefined, 10, pages(9), { timeLeft: () => false })
    expect(r.pagesRead).toBe(0)
    expect(parseCursors({ cursors: { 'dir:technopark': { next: 7, lastPage: 25 }, bad: 'x', 'dir:x': { next: -1 } } })).toEqual({
      'dir:technopark': { next: 7, lastPage: 25 },
      'dir:x': { next: 1 },
    })
  })

  it('GitHub org search pages: total → last page (capped at 1,000 results), page in the URL', () => {
    expect(searchLastPage({ total_count: 368 }, 50)).toBe(8)
    expect(searchLastPage({ total_count: 5000 }, 50)).toBe(20)
    expect(searchLastPage({}, 50)).toBe(1)
    expect(new URL(orgSearchUrl('Kochi', 50, 3)).searchParams.get('page')).toBe('3')
  })
})
