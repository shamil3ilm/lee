import { describe, expect, it, vi } from 'vitest'
import { brandKey, brandPrefixOf, nameKey, normalizeCandidates } from '@/lib/company-discovery/normalize'
import { remapToKnown } from '@/lib/company-discovery/fold'
import { buildOverpassQuery, parseOverpass, fetchOsmArea } from '@/lib/company-discovery/sources/overpass'
import { gleifUrl, parseGleifPage } from '@/lib/company-discovery/sources/gleif'
import { mcaUrl, parseCin, parseMcaPage, sectorOfNic, fetchMcaPage } from '@/lib/company-discovery/sources/mca'
import { countRegionCandidates, OSM_MIN_DAYS, pickArea, rankByLikelihood, runOsm, runRegisters, selectedPlaces } from '@/lib/company-discovery/sources/map-register'
import { areasFor, GLEIF_AREAS, MCA_STATES, OSM_AREAS } from '@/lib/company-discovery/sources/register-areas'
import { hireLikelihood, isObviousNonEmployer } from '@/lib/company-discovery/hire-likelihood'
import { googleMapsSearchUrl } from '@/lib/company-discovery/maps-link'
import { companyFit, COMPANY_FIT_WEIGHTS as W, type FitContext } from '@/lib/company-discovery/fit'
import { foundViaOf, sourceTagLabel } from '@/components/companies/types'
import { isListedHost } from '@/lib/net/outbound-hosts'
import { isRegionId } from '@/lib/regions/tree'
import type { CompanyCandidate } from '@/lib/company-discovery/types'
import type { FoldRow } from '@/lib/db/queries/localCompanies'
import type { HostLimiter } from '@/lib/reputation/rate-limit'
import { GLEIF_KUWAIT_PAGE, MCA_KERALA_PAGE, OVERPASS_KUWAIT, OVERPASS_TIMEOUT } from '@/tests/fixtures/company-discovery/map-register'

const NOW = new Date('2026-10-09T09:00:00Z')
const noWait: HostLimiter = { wait: async () => undefined } as unknown as HostLimiter
const cand = (over: Partial<CompanyCandidate>): CompanyCandidate => ({ name: 'X', regionIds: [], industries: [], sourceTags: ['paste'], evidence: {}, ...over })
const KUWAIT_CITY = OSM_AREAS.find((a) => a.id === 'kuwait-city')!
const GLEIF_KW = GLEIF_AREAS.find((a) => a.id === 'kw')!
const MCA_KL = MCA_STATES.find((s) => s.id === 'kerala')!

function jsonFetch(bodies: (url: string) => unknown, seen: string[] = []): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    seen.push(url)
    return new Response(JSON.stringify(bodies(url)), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

describe('legal-suffix normalisation (register legal names join brands)', () => {
  it('strips GCC and Indian legal forms', () => {
    expect(brandKey('National Bank of Kuwait S.A.K.P.')).toBe(brandKey('National Bank of Kuwait'))
    expect(brandKey('Zain Kuwait K.S.C.P.')).toBe(brandKey('Zain'))
    expect(brandKey('Alghanim Industries W.L.L.')).toBe(brandKey('Alghanim Industries'))
    expect(brandKey('Alghanim Industries W.L.L.')).toBe('alghanim')
    for (const form of ['W.L.L.', 'WLL', 'K.S.C.', 'K.S.C.(Closed)', 'K.S.C. (Closed)', 'K.S.C.C.', 'K.S.C.P.', 'K.S.C. (Holding)', 'S.P.C.', 'S.A.O.G', 'S.A.O.C', 'P.J.S.C.', 'PJSC', 'L.L.C.', 'FZ-LLC', 'FZE', 'FZCO', 'DMCC', 'Pvt. Ltd.', 'Private Limited', 'Co.', 'Company', 'Est.', 'Establishment', 'Trading Co. W.L.L.']) {
      expect(brandKey(`Sand Ledger ${form}`), form).toBe('sandledger')
    }
    expect(nameKey('Sand Ledger K.S.C. (Closed)')).toBe('sandledger')
    expect(nameKey('Sand Ledger Private Limited')).toBe('sandledger')
    expect(brandKey('Sand Ledger Company for Systems/With Limited Liability')).toBe(brandKey('Sand Ledger Company for Systems W.L.L.'))
  })

  it('never strips the brand itself', () => {
    expect(brandKey('Trading Hub')).toBe('tradinghub')
    expect(brandKey('Company Builder Example')).toBe('companybuilderexample')
    expect(brandKey('Establishment')).toBe('establishment')
    expect(nameKey('Holding Example Holding')).toBe('holdingexampleholding')
  })

  it('a legal name that begins with a known brand ("Agility Public Warehousing Company K.S.C.P." → Agility)', () => {
    expect(brandPrefixOf('Agility Public Warehousing Company K.S.C.P.', ['agility', 'zain'])).toBe('agility')
    // Short or ambiguous brands never match by prefix.
    expect(brandPrefixOf('Zain Example Holding K.S.C.', ['zain'])).toBeNull()
    expect(brandPrefixOf('Gulf Example Bank Holding K.S.C.P.', ['gulfexample', 'gulfexamplebank'])).toBeNull()
    expect(brandPrefixOf('Agility', ['agility'])).toBeNull()
  })
})

describe('dedupe with existing companies (legal name → brand)', () => {
  it('a GLEIF legal name joins the company known by its website in the same country', () => {
    const out = normalizeCandidates([
      cand({ name: 'Zain', website: 'https://www.zain.example', regionIds: ['kw'], sourceTags: ['seed'] }),
      cand({ name: 'Zain Kuwait K.S.C.P.', regionIds: ['kuwait-city'], sourceTags: ['register:gleif'], evidence: { lei: '5493000EXAMPLE000009' } }),
      cand({ name: 'Agility', website: 'https://agility.example', regionIds: ['kw'], sourceTags: ['seed'] }),
      cand({ name: 'Agility Public Warehousing Company K.S.C.P.', regionIds: ['kw'], sourceTags: ['register:gleif'] }),
      // same legal name in another country stays apart
      cand({ name: 'Zain Kuwait K.S.C.P.', regionIds: ['manama'], sourceTags: ['register:gleif'] }),
    ])
    expect(out.get('d:zain.example')!.sourceTags).toEqual(['seed', 'register:gleif'])
    expect(out.get('d:zain.example')!.evidence.lei).toBe('5493000EXAMPLE000009')
    expect(out.get('d:agility.example')!.sourceTags).toContain('register:gleif')
    expect([...out.keys()].filter((k) => k.startsWith('n:'))).toEqual(['n:zainkuwait:bh'])
  })

  it('a prefix match needs a register or map source (a pasted name never joins by prefix)', () => {
    const out = normalizeCandidates([
      cand({ name: 'Agility', website: 'https://agility.example', regionIds: ['kw'] }),
      cand({ name: 'Agility Public Warehousing Company', regionIds: ['kw'], sourceTags: ['paste'] }),
    ])
    expect(out.size).toBe(2)
  })

  it('across runs: the remap before insert points a register row at the stored company', () => {
    const row = (over: Partial<FoldRow>): FoldRow => ({ id: 'r1', sourceCompanyId: 'd:nbk.example', name: 'National Bank of Kuwait', domain: 'nbk.example', regionIds: ['kuwait-city', 'kw', 'gcc'], sourceTags: ['wikidata'], status: 'new', watch: null, applicationId: null, evidence: {}, ...over })
    const index = [row({}), row({ id: 'r2', sourceCompanyId: 'd:agility.example', name: 'Agility', domain: 'agility.example' })]
    const rows = remapToKnown(
      [
        { sourceCompanyId: 'n:nationalbankofkuwaitsakp:kw', name: 'National Bank of Kuwait S.A.K.P.', domain: null, regionIds: ['kw', 'gcc'], sourceTags: ['register:gleif'] },
        { sourceCompanyId: 'n:agilitypublicwarehousing:kw', name: 'Agility Public Warehousing Company K.S.C.P.', domain: null, regionIds: ['kw', 'gcc'], sourceTags: ['register:gleif'] },
      ],
      index,
    )
    expect(rows.map((r) => r.sourceCompanyId)).toEqual(['d:nbk.example', 'd:agility.example'])
  })
})

describe('OpenStreetMap (Overpass)', () => {
  it('builds a bounded query: timeout 60, the bbox, every office kind and large non-office employers, a result cap', () => {
    const q = buildOverpassQuery(KUWAIT_CITY.bbox)
    expect(q).toContain('[out:json][timeout:60][bbox:29.33,47.9,29.4,48.02]')
    expect(q).toContain('nwr["office"]["name"]')
    expect(q).toContain('hospital|university|college|bank')
    expect(q).toContain('mall|department_store')
    expect(q).toMatch(/out tags center 1500;$/)
    expect(() => buildOverpassQuery([30, 48, 29, 47])).toThrow()
  })

  it('keeps every kind of employer, drops obvious non-employers, folds branches, keeps no e-mail or phone', () => {
    const out = parseOverpass(OVERPASS_KUWAIT, KUWAIT_CITY)
    const names = out.map((c) => c.name).sort()
    expect(names).toEqual(['Example Avenues Mall', 'Example General Hospital', 'Example Logistics W.L.L.', 'Gulf Example Takaful', 'Ministry of Example Affairs', 'Pearl Example Bank', 'Sand Ledger Systems'])
    const bank = out.find((c) => c.name === 'Pearl Example Bank')!
    expect(bank).toMatchObject({ website: 'https://pearlbank.example', industries: ['banking'], sourceTags: ['map:osm'], evidence: { sector: 'bank', branches: 2 } })
    expect(out.find((c) => c.name === 'Sand Ledger Systems')).toMatchObject({
      website: 'https://sandledger.example',
      regionIds: ['kuwait-city'],
      industries: ['it_services'],
      evidence: { sector: 'it', osm: { id: 'node/101', tag: 'office=it' }, listedAt: 'https://www.openstreetmap.org/node/101' },
    })
    expect(out.find((c) => c.name === 'Example General Hospital')).toMatchObject({ regionIds: ['salmiya'], evidence: { sector: 'healthcare', osm: { id: 'way/201' } } })
    expect(out.find((c) => c.name === 'Example Logistics W.L.L.')!.website).toBe('https://exlogistics.example/en')
    expect(out.find((c) => c.name === 'Ministry of Example Affairs')!.evidence).toMatchObject({ sector: 'government', government: true })
    const json = JSON.stringify(out)
    expect(json).not.toContain('owner@sandledger.example')
    expect(json).not.toContain('+965')
  })

  it('an Overpass timeout remark is an error, not an empty area', () => {
    expect(() => parseOverpass(OVERPASS_TIMEOUT, KUWAIT_CITY)).toThrow(/timed out/)
  })

  it('fetches through the honest client with the query in the URL', async () => {
    const seen: string[] = []
    const items = await fetchOsmArea(KUWAIT_CITY, { fetchImpl: jsonFetch(() => OVERPASS_KUWAIT, seen), limiter: noWait })
    expect(items.length).toBe(7)
    expect(seen[0]).toMatch(/^https:\/\/overpass-api\.de\/api\/interpreter\?data=/)
  })
})

describe('GLEIF', () => {
  it('builds the country / full-text query, ACTIVE only', () => {
    expect(gleifUrl(GLEIF_KW, 2)).toBe('https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalAddress.country%5D=KW&filter%5Bentity.status%5D=ACTIVE&page%5Bsize%5D=200&page%5Bnumber%5D=2')
    expect(gleifUrl(GLEIF_AREAS.find((a) => a.id === 'kochi')!, 1)).toContain('filter%5Bfulltext%5D=Ernakulam')
    expect(() => gleifUrl({ country: 'kw' }, 1)).toThrow()
  })

  it('parses legal entities: trading or transliterated names, places, LEI; drops funds, inactive and malformed', () => {
    const r = parseGleifPage(GLEIF_KUWAIT_PAGE, GLEIF_KW)
    expect(r.lastPage).toBe(3)
    expect(r.items.map((c) => c.name)).toEqual(['Pearl Example Bank K.S.C.P.', 'Al-Mithal Trading Co. W.L.L.', 'Desert Example Airways'])
    expect(r.items[0]).toMatchObject({ regionIds: ['kuwait-city'], sourceTags: ['register:gleif'], evidence: { lei: '5493000EXAMPLE000001', sector: 'bank', listedAt: 'https://search.gleif.org/#/record/5493000EXAMPLE000001' } })
    expect(r.items[1]!.evidence.listedAs).toBe('شركة المثال للتجارة')
    expect(r.items[2]).toMatchObject({ evidence: { sector: 'airline', listedAs: 'Desert Example Airways K.S.C. (Closed)' } })
  })
})

describe('India MCA (data.gov.in)', () => {
  it('reads the CIN: NIC code, state, year', () => {
    expect(parseCin('U62011KL2015PTC000001')).toEqual({ nic: '62011', state: 'KL', year: 2015 })
    expect(sectorOfNic('72200', 2005)).toBe('it')
    expect(sectorOfNic('72200', 2015)).toBe('research')
    expect(parseCin('nope')).toBeNull()
    expect(sectorOfNic('62011')).toBe('software')
    expect(sectorOfNic('64191')).toBe('bank')
    expect(sectorOfNic('86100')).toBe('healthcare')
    expect(sectorOfNic('56101')).toBe('restaurant')
  })

  it('keeps active companies of the state, every activity code; never keeps the e-mail or the full address', () => {
    const r = parseMcaPage(MCA_KERALA_PAGE, MCA_KL)
    expect(r.lastPage).toBe(3)
    expect(r.inState).toBe(3)
    expect(r.items.map((c) => c.name)).toEqual(['BACKWATER EXAMPLE SOFTWARE PRIVATE LIMITED', 'EXAMPLE HOSPITALS PRIVATE LIMITED'])
    expect(r.items[0]).toMatchObject({ regionIds: ['kochi'], sourceTags: ['register:mca'], evidence: { cin: 'U62011KL2015PTC000001', nic: '62011', sector: 'software', paidUpCapital: 2500000, founded: 2015 } })
    expect(r.items[1]).toMatchObject({ regionIds: ['kozhikode'], evidence: { sector: 'healthcare', paidUpCapital: 150000000 } })
    const json = JSON.stringify(r.items)
    expect(json).not.toContain('founder@')
    expect(json).not.toContain('Infopark Road')
  })

  it('the key goes in the query; a page with no company of the state stops the walk', async () => {
    expect(mcaUrl(MCA_KL, 2, 'k3y')).toContain('api-key=k3y')
    expect(mcaUrl(MCA_KL, 2, 'k3y')).toContain('offset=500')
    const other = { ...MCA_KERALA_PAGE, records: [MCA_KERALA_PAGE.records[3]] }
    await expect(fetchMcaPage(MCA_KL, 1, 'k3y', { fetchImpl: jsonFetch(() => other), limiter: noWait })).rejects.toThrow(/state filter/)
  })
})

describe('hiring likelihood (every kind of employer, explained)', () => {
  it('a large bank is a likely employer of data/IT people, with the reason', () => {
    const h = hireLikelihood({ sector: 'bank', evidence: { employees: 2400, lei: 'X' } })
    expect(h.band).toBe('high')
    expect(h.why).toBe('Likely hires: data/IT (bank, 1,000+ staff)')
  })

  it('job postings seen are the strongest signal, whatever the sector', () => {
    const h = hireLikelihood({ sector: 'retail', evidence: { jobsSeen: 3 } })
    expect(h.band).toBe('high')
    expect(h.why).toContain('posted 3 jobs you saw')
  })

  it('a single shop ranks low but is explained, not dropped by the scorer', () => {
    const h = hireLikelihood({ sector: 'shop', evidence: {} })
    expect(h.band).toBe('low')
    expect(h.why).toBe('Unlikely to hire data/IT (shop)')
    expect(hireLikelihood({ sector: 'healthcare', evidence: { branches: 6 } }).why).toContain('6 branches')
    expect(hireLikelihood({ industries: ['banking'], evidence: { paidUpCapital: 2e8 } }).why).toContain('paid-up capital ₹20 cr')
  })

  it('hard-drops only obvious non-employers', () => {
    expect(isObviousNonEmployer({ name: 'X', amenity: 'atm' })).toBe(true)
    expect(isObviousNonEmployer({ name: 'X', amenity: 'restaurant' })).toBe(true)
    expect(isObviousNonEmployer({ name: 'X', shop: 'bakery' })).toBe(true)
    expect(isObviousNonEmployer({ name: 'X', building: 'house' })).toBe(true)
    expect(isObviousNonEmployer({ office: 'company' })).toBe(true)
    for (const tags of <Array<Record<string, string>>>[{ office: 'company' }, { amenity: 'bank' }, { amenity: 'hospital' }, { shop: 'mall' }, { office: 'government' }, { man_made: 'works' }, { office: 'insurance' }]) {
      expect(isObviousNonEmployer({ name: 'Example', ...tags }), JSON.stringify(tags)).toBe(false)
    }
  })

  it('non-tech employers survive ingestion and rank by likelihood', () => {
    const ranked = rankByLikelihood(parseOverpass(OVERPASS_KUWAIT, KUWAIT_CITY), 3).map((c) => c.name)
    expect(ranked).toContain('Pearl Example Bank')
    expect(ranked).not.toContain('Example Avenues Mall')
  })
})

describe('no tech bias in the company fit', () => {
  const CTX: FitContext = { targetRegions: ['gcc'], preferredRegions: [], targetFamilies: ['data_analyst'], readySkills: ['sql'], companyStages: [] }
  const fit = (over: Record<string, unknown>) =>
    companyFit({ name: 'Example Org', regionIds: ['kuwait-city', 'kw', 'gcc'], industry: [], stage: null, atsKind: null, careersUrl: null, evidence: {}, ...over } as never, CTX)

  it('unknown industry and no GitHub code are neutral, never zero', () => {
    const f = fit({})
    expect(f.chips.find((c) => c.kind === 'domain')).toMatchObject({ points: W.domainNeutral })
    expect(f.chips.find((c) => c.kind === 'tech')).toMatchObject({ points: W.techNeutral })
  })

  it('a bank fits a data analyst as a specialist domain', () => {
    expect(fit({ industry: ['banking'] }).chips.find((c) => c.kind === 'domain')).toMatchObject({ points: W.domainSpecialist })
  })

  it('a hospital with job postings is not ranked below a silent software house', () => {
    const hospital = fit({ evidence: { sector: 'healthcare', jobsSeen: 2 } })
    const software = fit({ industry: ['software'] })
    expect(hospital.score).toBeGreaterThanOrEqual(software.score)
    expect(hospital.chips.find((c) => c.kind === 'hiring')!.label).toBe('Posted 2 jobs you saw')
  })

  it('map and register provenance adds no points', () => {
    expect(fit({ sourceTags: ['map:osm'] } as never).score).toBe(fit({}).score)
  })
})

describe('area cursors and cadence', () => {
  it('every area names real regions; areas switch on by target places', () => {
    for (const a of [...OSM_AREAS, ...GLEIF_AREAS, ...MCA_STATES]) {
      expect(isRegionId(a.regionId), a.id).toBe(true)
      for (const p of a.places) expect(isRegionId(p), `${a.id}:${p}`).toBe(true)
    }
    expect(areasFor(OSM_AREAS, selectedPlaces(['kw'])).map((a) => a.id)).toEqual(['kuwait-city', 'salmiya', 'hawalli', 'farwaniya'])
    expect(areasFor(OSM_AREAS, selectedPlaces(['kochi'])).map((a) => a.id)).toEqual(['kochi'])
  })

  it('picks a part-read area first, then an unread one, then the oldest finished past the revisit time', () => {
    const areas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(pickArea(areas, { 'g:a': { next: 1, completedAt: '2026-10-01T00:00:00Z' }, 'g:b': { next: 3 } }, 'g', NOW)!.id).toBe('b')
    expect(pickArea(areas, { 'g:a': { next: 1, completedAt: '2026-10-01T00:00:00Z' } }, 'g', NOW)!.id).toBe('b')
    const done = { 'g:a': { next: 1, completedAt: '2026-05-01T00:00:00Z' }, 'g:b': { next: 1, completedAt: '2026-04-01T00:00:00Z' }, 'g:c': { next: 1, completedAt: '2026-10-01T00:00:00Z' } }
    expect(pickArea(areas, done, 'g', NOW)!.id).toBe('b')
    expect(pickArea(areas, { 'g:a': { next: 1, completedAt: '2026-10-01T00:00:00Z' }, 'g:b': { next: 1, completedAt: '2026-10-01T00:00:00Z' }, 'g:c': { next: 1, completedAt: '2026-10-01T00:00:00Z' } }, 'g', NOW)).toBeNull()
  })

  it('OpenStreetMap: one area per run, then nothing until OSM_MIN_DAYS have passed', async () => {
    const seen: string[] = []
    const cursors = {}
    const deps = { fetchImpl: jsonFetch(() => OVERPASS_KUWAIT, seen), limiter: noWait, now: NOW }
    const first = await runOsm(selectedPlaces(['kw']), cursors, deps)
    expect(first.areas).toEqual(['kuwait-city'])
    expect(first.items.length).toBeGreaterThan(0)
    const again = await runOsm(selectedPlaces(['kw']), cursors, { ...deps, now: new Date(NOW.getTime() + 86_400_000) })
    expect(again.areas).toEqual([])
    const later = await runOsm(selectedPlaces(['kw']), cursors, { ...deps, now: new Date(NOW.getTime() + OSM_MIN_DAYS * 86_400_000) })
    expect(later.areas).toEqual(['salmiya'])
    expect(seen).toHaveLength(2)
  })

  it('registers: GLEIF pages with a cursor; MCA only with a key', async () => {
    const seen: string[] = []
    const cursors: Record<string, { next: number }> = {}
    const fetchImpl = jsonFetch((u) => (u.includes('gleif') ? GLEIF_KUWAIT_PAGE : MCA_KERALA_PAGE), seen)
    const r = await runRegisters(selectedPlaces(['kw', 'kerala']), cursors, { fetchImpl, limiter: noWait, now: NOW })
    expect(r.areas).toEqual(['gleif:kw'])
    expect(r.pages).toBe(3)
    expect(seen.every((u) => u.startsWith('https://api.gleif.org/'))).toBe(true)
    const withKey = await runRegisters(selectedPlaces(['kerala']), {}, { fetchImpl, limiter: noWait, now: NOW, dataGovInKey: 'k3y' })
    expect(withKey.areas).toEqual(['gleif:kochi', 'mca:kerala'])
    expect(withKey.items.some((c) => c.sourceTags.includes('register:mca'))).toBe(true)
  })

  it('countRegionCandidates: pure fetch + parse, no database', async () => {
    const r = await countRegionCandidates('kw', { fetchImpl: jsonFetch((u) => (u.includes('gleif') ? GLEIF_KUWAIT_PAGE : OVERPASS_KUWAIT)), limiter: noWait })
    expect(r.osm).toEqual([expect.objectContaining({ area: 'kuwait-city', candidates: 7, withWebsite: 3 })])
    expect(r.gleif).toEqual([expect.objectContaining({ area: 'kw', total: 450, firstPageKept: 3 })])
  })
})

describe('provenance, Google Maps link and outbound hosts', () => {
  it('"Found via map/register" only when maps or registers alone listed it', () => {
    expect(foundViaOf(['map:osm'])).toBe('map')
    expect(foundViaOf(['register:gleif', 'register:mca'])).toBe('register')
    expect(foundViaOf(['map:osm', 'register:gleif'])).toBe('map and register')
    expect(foundViaOf(['map:osm', 'directory:infopark'])).toBeNull()
    expect(sourceTagLabel('map:osm')).toBe('OpenStreetMap')
  })

  it('a plain Maps search URL, no API key', () => {
    expect(googleMapsSearchUrl('Sand Ledger', 'Kuwait City')).toBe('https://www.google.com/maps/search/?api=1&query=Sand%20Ledger%20Kuwait%20City')
    expect(googleMapsSearchUrl('A&B Example', null)).toBe('https://www.google.com/maps/search/?api=1&query=A%26B%20Example')
  })

  it('the new hosts are registered', () => {
    for (const h of ['overpass-api.de', 'api.gleif.org', 'api.data.gov.in']) expect(isListedHost(h), h).toBe(true)
  })
})
