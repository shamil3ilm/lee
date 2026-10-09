import { describe, expect, it } from 'vitest'
import { dedupeKey, deepestRegions, domainOf, normalizeCandidates, sizeBandOf, stageOf } from '@/lib/company-discovery/normalize'
import { connectionsAt, linkedinCandidates } from '@/lib/company-discovery/warm'
import { industriesFromText } from '@/lib/company-discovery/industry'
import type { CompanyCandidate } from '@/lib/company-discovery/types'

const c = (over: Partial<CompanyCandidate>): CompanyCandidate => ({
  name: 'X',
  regionIds: [],
  industries: [],
  sourceTags: ['wikidata'],
  evidence: {},
  ...over,
})

describe('domainOf', () => {
  it('reduces a website to its host without www; drops profiles and junk', () => {
    expect(domainOf('https://www.DinarPay.example/en?x=1')).toBe('dinarpay.example')
    expect(domainOf('dinarpay.example')).toBe('dinarpay.example')
    expect(domainOf('https://www.linkedin.com/company/x')).toBeNull()
    expect(domainOf('https://github.com/x')).toBeNull()
    expect(domainOf('ftp://x.example')).toBeNull()
    expect(domainOf('not a url')).toBeNull()
  })
})

describe('size and stage', () => {
  it('bands employees and infers a stage from size and age', () => {
    expect(sizeBandOf(8)).toBe('1-10')
    expect(sizeBandOf(1200)).toBe('1000+')
    expect(sizeBandOf(0)).toBeUndefined()
    const now = new Date('2026-10-09')
    expect(stageOf({ sizeBand: '11-50', founded: 2020 }, now)).toBe('startup')
    expect(stageOf({ sizeBand: '201-1000', founded: 2015 }, now)).toBe('scaleup')
    expect(stageOf({ sizeBand: '1000+' }, now)).toBe('enterprise')
    expect(stageOf({ founded: 1960 }, now)).toBe('enterprise')
    expect(stageOf({}, now)).toBeUndefined()
  })
})

describe('normalise and dedupe', () => {
  it('merges the same company from two sources by domain, unioning tags, regions and industries', () => {
    const out = normalizeCandidates([
      c({ name: 'Dinar Pay', website: 'https://www.dinarpay.example/', regionIds: ['kw'], industries: ['payments'], sourceTags: ['wikidata'], evidence: { founded: 2019 } }),
      c({ name: 'dinarpay', website: 'http://dinarpay.example/about', regionIds: ['kuwait-city'], industries: ['fintech'], sourceTags: ['github'], evidence: { githubLogin: 'dinarpay', languages: ['PHP'] } }),
    ])
    expect([...out.keys()]).toEqual(['d:dinarpay.example'])
    const m = out.get('d:dinarpay.example')!
    expect(m.name).toBe('Dinar Pay')
    expect(m.regionIds).toEqual(['kuwait-city'])
    expect(m.industries).toEqual(['payments', 'fintech'])
    expect(m.sourceTags).toEqual(['wikidata', 'github'])
    expect(m.evidence).toMatchObject({ founded: 2019, githubLogin: 'dinarpay', languages: ['PHP'] })
  })

  it('joins a name-only candidate to the domain one in the same country; keeps other countries apart', () => {
    const out = normalizeCandidates([
      c({ name: 'Sand Ledger LLC', website: 'https://sandledger.example', regionIds: ['dubai'] }),
      c({ name: 'Sand Ledger', regionIds: ['abu-dhabi'], sourceTags: ['linkedin'], evidence: { connections: 2 } }),
      c({ name: 'Sand Ledger', regionIds: ['kochi'], sourceTags: ['paste'] }),
    ])
    expect([...out.keys()].sort()).toEqual(['d:sandledger.example', 'n:sandledger:in'])
    expect(out.get('d:sandledger.example')!.evidence.connections).toBe(2)
  })

  it('a placeless LinkedIn company joins the only same-named company; spacing and suffixes ignored', () => {
    const out = normalizeCandidates([
      c({ name: 'Dinar Pay', website: 'https://dinarpay.example', regionIds: ['kw'] }),
      c({ name: 'dinarpay', regionIds: ['kw'], sourceTags: ['github'], evidence: { githubLogin: 'dinarpay' } }),
      c({ name: 'Dinar Pay K.S.C.', regionIds: [], sourceTags: ['linkedin'], evidence: { connections: 3 } }),
    ])
    expect([...out.keys()]).toEqual(['d:dinarpay.example'])
    expect(out.get('d:dinarpay.example')!.sourceTags.sort()).toEqual(['github', 'linkedin', 'wikidata'])
  })

  it('drops empty names; keys are stable', () => {
    expect(normalizeCandidates([c({ name: ' ' })]).size).toBe(0)
    expect(dedupeKey({ name: 'Acme Co.', website: undefined, regionIds: ['riyadh'] })).toBe('n:acme:sa')
    expect(deepestRegions(['ae', 'dubai', 'gcc'])).toEqual(['dubai'])
  })
})

describe('industries from text', () => {
  it('tags payments, e-invoicing and ERP words', () => {
    expect(industriesFromText('ZATCA e-invoicing and ERP for SMEs')).toEqual(expect.arrayContaining(['einvoicing', 'erp']))
    expect(industriesFromText('payment gateway for merchants')).toContain('payments')
    expect(industriesFromText('')).toEqual([])
  })
})

describe('warm-intro hint', () => {
  const counts = [
    { key: 'dinar pay', company: 'Dinar Pay', n: 2 },
    { key: 'dinar pay kuwait', company: 'Dinar Pay Kuwait', n: 1 },
    { key: 'dinarpayments', company: 'Dinarpayments', n: 5 },
    { key: 'self employed', company: 'Self-employed', n: 9 },
  ]
  it('counts connections whose company matches as a whole-word prefix either way', () => {
    expect(connectionsAt('Dinar Pay W.L.L.', counts)).toBe(3)
    expect(connectionsAt('Unknown Co', counts)).toBe(0)
  })
  it('turns companies with at least two connections into candidates, never "self-employed"', () => {
    const out = linkedinCandidates(counts)
    expect(out.map((x) => x.name)).toEqual(['Dinar Pay', 'Dinarpayments'])
    expect(out[0]).toMatchObject({ sourceTags: ['linkedin'], evidence: { connections: 2 } })
  })
})
