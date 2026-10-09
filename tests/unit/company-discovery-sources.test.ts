import { describe, expect, it } from 'vitest'
import { buildCompanyQuery, parseWikidataCompanies } from '@/lib/company-discovery/sources/wikidata'
import { orgSearchUrl, parseOrgProfile, parseOrgSearch, parseRepoLanguages, withOrgDetails } from '@/lib/company-discovery/sources/github'
import { parseYcCompanies } from '@/lib/company-discovery/sources/yc'
import { parseQstpDirectory, parseTechnoparkCompanies } from '@/lib/company-discovery/sources/directories'
import { parsePastedCompanies } from '@/lib/company-discovery/sources/paste'
import { BROWSE_DIRECTORIES, BROWSE_GROUPS } from '@/lib/company-discovery/sources/browse'
import { githubLocations, targetPlaces } from '@/lib/company-discovery/targets'
import { weeklySlice, wikidataGroups } from '@/lib/company-discovery/plan'
import {
  GITHUB_ORGS_KUWAIT,
  GITHUB_ORG_DEVHOUSE,
  GITHUB_REPOS_DEVHOUSE,
  QSTP_DIRECTORY,
  TECHNOPARK_PAGE,
  WIKIDATA_KW,
  YC_ALL,
} from '@/tests/fixtures/company-discovery'

const NOW = new Date('2026-10-09T09:00:00Z')

describe('Wikidata SPARQL', () => {
  it('builds a query from validated QIDs only, with the industry list and a limit', () => {
    const q = buildCompanyQuery(targetPlaces(['kw']), 50)
    expect(q).toContain('wd:Q817')
    expect(q).toContain('wd:Q35178')
    expect(q).toContain('wdt:P159')
    expect(q).toContain('wdt:P17')
    expect(q).toContain('wd:Q16319025')
    expect(q).toMatch(/LIMIT 50$/)
  })

  it('parses rows into one candidate per item, with the deepest region, industries, size and stage', () => {
    const out = parseWikidataCompanies(WIKIDATA_KW, NOW)
    const names = out.map((c) => c.name)
    expect(names).toEqual(['Dinar Pay', 'Gulf Ledger Bank', 'Ministry of Example Services'])
    const pay = out[0]!
    expect(pay.regionIds.sort()).toEqual(['kuwait-city', 'kw'])
    expect(pay.industries).toEqual(['payments', 'fintech'])
    expect(pay.website).toBe('https://www.dinarpay.example/')
    expect(pay.sizeBand).toBe('11-50')
    expect(pay.stage).toBe('startup')
    expect(pay.evidence).toMatchObject({ wikidataId: 'Q900001', founded: 2019, employees: 45 })
    expect(pay.evidence.logoUrl).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Dinar%20Pay.svg?width=64')
    const bank = out[1]!
    expect(bank.sizeBand).toBe('1000+')
    expect(bank.stage).toBe('enterprise')
    expect(bank.industries).toEqual(['banking'])
  })

  it('returns nothing for a malformed body', () => {
    expect(parseWikidataCompanies(null)).toEqual([])
    expect(parseWikidataCompanies({ results: { bindings: 'x' } })).toEqual([])
  })
})

describe('GitHub org search', () => {
  it('quotes the location and asks for orgs only', () => {
    const url = new URL(orgSearchUrl('Abu Dhabi'))
    expect(url.host).toBe('api.github.com')
    expect(url.searchParams.get('q')).toBe('type:org location:"Abu Dhabi"')
    expect(new URL(orgSearchUrl('Dubai"; drop')).searchParams.get('q')).toBe('type:org location:"Dubai drop"')
  })

  it('keeps organisations only (no user accounts)', () => {
    const out = parseOrgSearch(GITHUB_ORGS_KUWAIT, 'kw')
    expect(out.map((c) => c.evidence.githubLogin)).toEqual(['dinarpay', 'kw-devhouse'])
    expect(out[0]!.regionIds).toEqual(['kw'])
    expect(out[0]!.evidence.logoUrl).toMatch(/^https:\/\/avatars\.githubusercontent\.com\//)
  })

  it('reads the org profile and the languages of its own recent repos', () => {
    const profile = parseOrgProfile(GITHUB_ORG_DEVHOUSE)
    expect(profile).toMatchObject({ name: 'KW Devhouse', website: 'https://kwdevhouse.example', publicRepos: 24 })
    expect(parseRepoLanguages(GITHUB_REPOS_DEVHOUSE)).toEqual(['PHP', 'TypeScript'])
    const merged = withOrgDetails(parseOrgSearch(GITHUB_ORGS_KUWAIT, 'kw')[1]!, { profile, languages: ['PHP', 'TypeScript'] })
    expect(merged.name).toBe('KW Devhouse')
    expect(merged.website).toBe('https://kwdevhouse.example')
    expect(merged.industries).toEqual(expect.arrayContaining(['payments', 'erp', 'it_services']))
  })
})

describe('YC dataset (yc-oss)', () => {
  it('keeps active GCC / India companies with facts only (no descriptions or logos)', () => {
    const out = parseYcCompanies(YC_ALL)
    expect(out.map((c) => c.name)).toEqual(['Kochi Ledger', 'Dubai Data Labs'])
    const kochi = out[0]!
    expect(kochi.regionIds).toEqual(['kochi'])
    expect(kochi.industries).toEqual(expect.arrayContaining(['payments', 'fintech', 'saas']))
    expect(kochi.stage).toBe('startup')
    expect(kochi.evidence.description).toBeUndefined()
    expect(kochi.evidence.logoUrl).toBeUndefined()
    expect(kochi.evidence.listedAt).toBe('https://www.ycombinator.com/companies/kochi-ledger')
    expect(out[1]!.regionIds).toEqual(['dubai'])
    expect(out[1]!.stage).toBe('scaleup')
  })
})

describe('park and free-zone directories', () => {
  it('Technopark: active companies in Trivandrum, names only', () => {
    const { companies, lastPage } = parseTechnoparkCompanies(TECHNOPARK_PAGE)
    expect(lastPage).toBe(25)
    expect(companies).toHaveLength(1)
    expect(companies[0]).toMatchObject({ name: 'Trivandrum Example Systems (P) Ltd', regionIds: ['thiruvananthapuram'], sourceTags: ['directory:technopark'] })
  })

  it('QSTP: website from the entry, query string dropped; sector to industries', () => {
    const [c] = parseQstpDirectory(QSTP_DIRECTORY)
    expect(c).toMatchObject({ name: 'Doha AI Example', website: 'https://dohaai.example/', regionIds: ['doha'] })
    expect(c!.industries).toContain('data')
    expect(c!.evidence.listedAt).toBe('https://qstp.qa/directory/doha-ai-example/')
  })

  it('browse-only directories cover the UAE free zones, Kuwait and Kerala, each with a reason', () => {
    const ids = BROWSE_DIRECTORIES.map((d) => d.id)
    expect(ids).toEqual(expect.arrayContaining(['hub71', 'in5', 'dic', 'dtec', 'difc', 'adgm', 'cbk-hub', 'nfsmed', 'infopark', 'ksum']))
    for (const d of BROWSE_DIRECTORIES) {
      expect(d.url).toMatch(/^https:\/\//)
      expect(d.why.length).toBeGreaterThan(5)
      expect(BROWSE_GROUPS.some((g) => g.id === d.region)).toBe(true)
    }
  })
})

describe('pasted companies', () => {
  it('reads names and websites, unwraps Google links, finds the place', () => {
    const out = parsePastedCompanies(
      [
        '1. **Sand Ledger** - https://www.google.com/url?q=https://sandledger.example/&sa=U — ERP for SMEs in Kuwait City',
        '- Orbit Payments: payments startup in Dubai (orbitpay.example)',
        'www.only-a-site.example',
        'just some words',
      ].join('\n'),
    )
    expect(out.map((c) => c.name)).toEqual(['Sand Ledger', 'Orbit Payments', 'only-a-site'])
    expect(out[0]!.website).toBe('https://sandledger.example')
    expect(out[0]!.regionIds).toEqual(['kuwait-city'])
    expect(out[0]!.industries).toContain('erp')
    expect(out[1]!.regionIds).toEqual(['dubai'])
    expect(out[1]!.industries).toContain('payments')
  })
})

describe('targets', () => {
  it('starred places come first; a city adds its country; India expands to cities', () => {
    const ids = targetPlaces(['gcc', 'kerala'], ['kw']).map((p) => p.id)
    expect(ids.slice(0, 3).sort()).toEqual(['kuwait-city', 'kw', 'salmiya'])
    expect(ids).toEqual(expect.arrayContaining(['ae', 'dubai', 'abu-dhabi', 'sharjah', 'kochi', 'thiruvananthapuram', 'kozhikode']))
    expect(targetPlaces(['dubai']).map((p) => p.id).sort()).toEqual(['ae', 'dubai'])
  })

  it('groups Wikidata places per country and rotates GitHub terms weekly', () => {
    const groups = wikidataGroups(targetPlaces(['ae', 'kw']))
    expect(groups.map((g) => g.map((p) => p.id).sort())).toEqual([
      ['abu-dhabi', 'ae', 'ajman', 'dubai', 'sharjah'],
      ['kuwait-city', 'kw', 'salmiya'],
    ])
    const terms = githubLocations(targetPlaces(['gcc', 'kerala']))
    expect(terms.some((t) => t.term === 'Kuwait')).toBe(true)
    const a = weeklySlice(terms, 6, NOW)
    const b = weeklySlice(terms, 6, new Date('2026-10-16T09:00:00Z'))
    expect(a).toHaveLength(6)
    expect(a).not.toEqual(b)
  })
})
