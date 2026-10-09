import { describe, expect, it } from 'vitest'
import { brandKey, domainOf, nameKey, normalizeCandidates } from '@/lib/company-discovery/normalize'
import { applySeedAliases, seedByName, seedCandidates, seedFor, SEED_COMPANIES } from '@/lib/company-discovery/seed'
import { boardOf, employerName, employersFromPostings, employersFromTracked, type PostingEmployer } from '@/lib/company-discovery/sources/jobs'
import { candidateFromChoice, domainGuesses, parseFacts, parseSearchHits, splitQuery } from '@/lib/company-discovery/search'
import { fixtureOptions, lookupFixturesEnabled } from '@/lib/company-discovery/search-fixtures'
import { findDuplicates, remapToKnown } from '@/lib/company-discovery/fold'
import { isIndustry } from '@/lib/company-discovery/industry'
import { inTargets } from '@/lib/company-discovery/collect'
import { isRegionId } from '@/lib/regions/tree'
import type { CompanyCandidate } from '@/lib/company-discovery/types'
import type { FoldRow } from '@/lib/db/queries/localCompanies'

const NOW = new Date('2026-10-09T09:00:00Z')

const cand = (over: Partial<CompanyCandidate>): CompanyCandidate => ({ name: 'X', regionIds: [], industries: [], sourceTags: ['paste'], evidence: {}, ...over })

describe('name keys', () => {
  it('Indian "(P) Ltd" / "Pvt" forms reduce like the plain name', () => {
    expect(nameKey('QBurst Technologies (P) Ltd')).toBe(nameKey('QBurst Technologies'))
    expect(nameKey('Acme Example Pvt. Ltd.')).toBe(nameKey('Acme Example'))
  })

  it('brand keys drop generic tail words but keep at least one word', () => {
    expect(brandKey('QBurst Technologies (P) Ltd')).toBe('qburst')
    expect(brandKey('QBURST')).toBe('qburst')
    expect(brandKey('Fingent Global Solutions')).toBe('fingent')
    expect(brandKey('Technologies')).toBe('technologies')
  })

  it('a name-only park listing joins the same brand known by its website in the same country', () => {
    const out = normalizeCandidates([
      cand({ name: 'QBurst Technologies (P) Ltd', regionIds: ['thiruvananthapuram'], sourceTags: ['directory:technopark'] }),
      cand({ name: 'QBURST', website: 'http://www.qburst.com', regionIds: ['kozhikode'], sourceTags: ['directory:ul-cyberpark'] }),
      cand({ name: 'QBurst Technologies', website: 'https://www.qburst.com', regionIds: ['kochi'], sourceTags: ['directory:infopark'] }),
    ])
    expect(out.size).toBe(1)
    const q = [...out.values()][0]!
    expect(q.sourceTags.sort()).toEqual(['directory:infopark', 'directory:technopark', 'directory:ul-cyberpark'])
    expect(q.regionIds.sort()).toEqual(['kochi', 'kozhikode', 'thiruvananthapuram'])
  })
})

describe('seed catalog (a recall floor)', () => {
  it('has unique domains, valid regions and industries, a verification date and https sites', () => {
    const domains = SEED_COMPANIES.map((s) => domainOf(s.website))
    expect(domains.every(Boolean)).toBe(true)
    expect(new Set(domains).size).toBe(domains.length)
    for (const s of SEED_COMPANIES) {
      expect(s.source).toBe('seed')
      expect(s.website.startsWith('https://')).toBe(true)
      expect(s.regionIds.length).toBeGreaterThan(0)
      expect(s.regionIds.every(isRegionId), s.name).toBe(true)
      expect(s.industries.every(isIndustry), s.name).toBe(true)
      expect(s.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('covers the priority regions, CareStack and QBurst included', () => {
    const names = SEED_COMPANIES.map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['CareStack', 'QBurst', 'Careem', 'Tap Payments', 'Tamara', 'Snoonu']))
    const kerala = seedCandidates(['kerala'])
    expect(kerala.map((c) => c.name)).toEqual(expect.arrayContaining(['CareStack', 'QBurst', 'UST']))
    expect(kerala.every((c) => c.sourceTags.join() === 'seed')).toBe(true)
    expect(seedCandidates(['kw']).map((c) => c.name)).toEqual(expect.arrayContaining(['Tap Payments', 'talabat']))
    expect(seedCandidates(['qa']).map((c) => c.name)).not.toContain('CareStack')
  })

  it('a legal-name listing becomes the seed company (so it dedupes by domain), keeping the listed name', () => {
    expect(seedFor('Good Methods Software Solutions (P) Ltd', ['thiruvananthapuram'])?.name).toBe('CareStack')
    expect(seedFor('Good Methods Software Solutions (P) Ltd', ['dubai'])).toBeNull()
    const [c] = applySeedAliases([cand({ name: 'Good Methods Software Solutions (P) Ltd', regionIds: ['thiruvananthapuram'], sourceTags: ['directory:technopark'] })])
    expect(c).toMatchObject({ name: 'CareStack', website: 'https://carestack.com', sourceTags: ['directory:technopark'], evidence: { listedAs: 'Good Methods Software Solutions (P) Ltd' } })
    // A listing with its own website is left alone.
    const own = cand({ name: 'Good Methods Example', website: 'https://gm.example', regionIds: ['kochi'] })
    expect(applySeedAliases([own])[0]).toBe(own)
    expect(seedByName('qburst')?.website).toBe('https://www.qburst.com')
  })
})

describe('employers seen in jobs', () => {
  const row = (over: Partial<PostingEmployer>): PostingEmployer => ({
    companyName: 'Lagoon Labs Example',
    companyDomain: null,
    companyWebsite: null,
    location: 'Kochi, Kerala',
    regionIds: [],
    sourceKind: 'email_alert',
    sourceConfig: {},
    sourceId: 's1',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  })

  it('one company per employer, placed by the posting location, counted, with its board when the source polls it', () => {
    const out = employersFromPostings(
      [
        row({}),
        row({ createdAt: new Date('2026-08-01T00:00:00Z'), regionIds: ['kochi', 'kerala', 'in'] }),
        row({ companyName: 'Dune Pay Example', companyDomain: 'dunepay.example', location: 'Dubai, UAE', sourceKind: 'greenhouse', sourceConfig: { company: 'dunepay' }, sourceId: 'gh1' }),
        row({ companyName: 'Confidential' }),
        row({ companyName: 'Gulf Staffing Recruitment Services' }),
      ],
      NOW,
    )
    expect(out.map((c) => c.name)).toEqual(['Lagoon Labs Example', 'Dune Pay Example'])
    expect(out[0]).toMatchObject({ regionIds: ['kochi'], sourceTags: ['jobs'], evidence: { jobsSeen: 2, jobsRecent30: 1, jobsPrior60: 1 } })
    expect(out[1]).toMatchObject({ website: 'https://dunepay.example', regionIds: ['dubai'], board: { kind: 'greenhouse', slug: 'dunepay', url: 'https://boards.greenhouse.io/dunepay', sourceId: 'gh1' } })
  })

  it('placeholder and agency names are not employers; unknown boards are ignored', () => {
    expect(employerName('Confidential Company')).toBeNull()
    expect(employerName('ABC Manpower Consultants')).toBeNull()
    expect(employerName('  Kayal Data Example  ')).toBe('Kayal Data Example')
    expect(boardOf('workday', { url: 'x' })).toBeNull()
    expect(boardOf('lever', { company: '../x' })).toBeNull()
  })

  it('watch-list and applied-to companies become candidates placed by their HQ', () => {
    expect(employersFromTracked([{ name: 'Harbour Ledger Example', domain: 'harbourledger.example', website: null, city: 'Doha', country: 'Qatar', watched: true }])).toEqual([
      { name: 'Harbour Ledger Example', website: 'https://harbourledger.example', regionIds: ['doha'], industries: [], sourceTags: ['jobs'], evidence: {} },
    ])
  })
})

describe('national lists keep only target places', () => {
  it('a NASSCOM member in Hyderabad is dropped for a Kerala search, kept for India', () => {
    const hyd = cand({ name: 'Deccan Example', regionIds: ['hyderabad'] })
    expect(inTargets(hyd, ['kerala'])).toBe(false)
    expect(inTargets(hyd, ['in'])).toBe(true)
    expect(inTargets(cand({ regionIds: ['kochi'] }), ['kerala'])).toBe(true)
  })
})

describe('company search box (lee suggests, you confirm)', () => {
  it('splits a place off the typed name and guesses domains', () => {
    expect(splitQuery('Acme Payments, Dubai')).toEqual({ name: 'Acme Payments', regionIds: ['dubai'] })
    expect(splitQuery('QBurst')).toEqual({ name: 'QBurst', regionIds: [] })
    expect(domainGuesses('Acme Payments Pvt Ltd', ['ae'])).toEqual(['acmepayments.com', 'acmepayments.ai', 'acmepayments.io', 'acmepayments.co', 'acmepayments.ae'])
    expect(domainGuesses('!')).toEqual([])
  })

  it('reads Wikidata search hits and company facts (website, HQ place, industry, year, size)', () => {
    expect(parseSearchHits({ search: [{ id: 'Q900001', label: 'Dinar Pay', description: 'payments company' }, { id: 'bad' }] })).toEqual([
      { id: 'Q900001', label: 'Dinar Pay', description: 'payments company' },
    ])
    const E = 'http://www.wikidata.org/entity/'
    const facts = parseFacts({
      results: {
        bindings: [
          { item: { value: `${E}Q900001` }, site: { value: 'https://dinarpay.example' }, hq: { value: `${E}Q35178` }, ind: { value: `${E}Q1956140` }, inception: { value: '2019-01-01T00:00:00Z' }, employees: { value: '45' } },
        ],
      },
    })
    const f = facts.get('Q900001')!
    expect(f.site).toBe('https://dinarpay.example')
    expect([...f.places]).toEqual(['kuwait-city'])
    expect([...f.industries]).toEqual(['payments'])
    expect(f).toMatchObject({ founded: 2019, employees: 45 })
  })

  it('the confirmed choice becomes a "search" candidate; a corrected website is re-validated', () => {
    const c = candidateFromChoice({ name: ' Acme  Payments ', website: 'acmepay.example/about', regionIds: ['dubai'], industries: ['payments'], wikidataId: 'Q1', founded: 2022, employees: 30 }, NOW)
    expect(c).toMatchObject({ name: 'Acme Payments', website: 'https://acmepay.example', sourceTags: ['search'], sizeBand: '11-50', stage: 'startup', evidence: { wikidataId: 'Q1', founded: 2022 } })
    expect(candidateFromChoice({ name: 'No Site', website: 'javascript:alert(1)', regionIds: [], industries: [] }).website).toBeUndefined()
  })

  it('E2E fixtures only with the local test sign-in', () => {
    expect(lookupFixturesEnabled({ E2E_TEST_LOGIN: '1', E2E_LOOKUP_FIXTURES: '1', NODE_ENV: 'development' })).toBe(true)
    expect(lookupFixturesEnabled({ E2E_TEST_LOGIN: '1', E2E_LOOKUP_FIXTURES: '1', NODE_ENV: 'production' })).toBe(false)
    expect(lookupFixturesEnabled({ E2E_TEST_LOGIN: '1', E2E_LOOKUP_FIXTURES: '1', VERCEL: '1' })).toBe(false)
    expect(fixtureOptions('Lagoon Labs')[0]).toMatchObject({ name: 'Lagoon Labs', website: 'https://lagoonlabs.example', source: 'wikidata' })
  })
})

describe('duplicate fold', () => {
  const r = (over: Partial<FoldRow>): FoldRow => ({ id: 'x', sourceCompanyId: 'n:x:in', name: 'X', domain: null, regionIds: ['in'], sourceTags: [], status: 'new', watch: null, applicationId: null, evidence: {}, ...over })

  it('merges a name-only row and a second row of the same domain into the domain-keyed row; never a row the user acted on', () => {
    const keeper = r({ id: 'k', sourceCompanyId: 'd:qburst.com', name: 'QBurst', domain: 'qburst.com', regionIds: ['kochi', 'kerala', 'in'] })
    const nameOnly = r({ id: 'n', sourceCompanyId: 'n:qbursttechnologies:in', name: 'QBurst Technologies (P) Ltd', regionIds: ['thiruvananthapuram', 'kerala', 'in'] })
    const sameDomain = r({ id: 's', sourceCompanyId: 'n:goodmethods:in', name: 'Good Methods', domain: 'qburst.com' })
    const saved = r({ id: 'v', sourceCompanyId: 'n:qburst:in', name: 'QBurst', status: 'saved' })
    const pairs = findDuplicates([keeper, nameOnly, sameDomain, saved])
    expect(pairs.map((p) => [p.keeper.id, p.dup.id]).sort()).toEqual([
      ['k', 'n'],
      ['k', 's'],
    ])
  })

  it('remaps a name-only insert onto the stored row of its brand', () => {
    const index = [r({ sourceCompanyId: 'd:qburst.com', name: 'QBurst Technologies', domain: 'qburst.com', regionIds: ['kochi', 'kerala', 'in'] })]
    const rows = remapToKnown([{ sourceCompanyId: 'n:qbursttechnologies:in', name: 'QBurst Technologies (P) Ltd', domain: null, regionIds: ['thiruvananthapuram', 'kerala', 'in'] }], index)
    expect(rows[0]!.sourceCompanyId).toBe('d:qburst.com')
  })
})
