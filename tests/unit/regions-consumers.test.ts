import { describe, expect, it } from 'vitest'
import { evaluateRelevance, type GateInput } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, relevanceKey, searchPrefsFromProfile, targetRegionIds, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { searchPrefsPatch, targetRegionsFromForm } from '@/lib/discovery/relevance/form'
import { searchPrefsFormValues, lookingForView } from '@/lib/discovery/relevance/view'
import { parseGccLocation } from '@/lib/discovery/relevance/location'
import { regionComponent } from '@/lib/discovery/match/fit'
import { rankCandidate, type RankCandidate } from '@/lib/apply/rank'
import { targetRegionIds as rankTargets } from '@/lib/apply/candidates'
import { jobRegions, regionFit } from '@/lib/cv-fit/region'
import { photoCountry } from '@/lib/cv-fit/photo/country'
import type { UserProfile } from '@/lib/db/queries/profile'
import { matchJob, matchProfile } from './discovery-match-helpers'

const prefs = (regionIds: string[], over: Partial<SearchPrefs> = {}): SearchPrefs =>
  searchPrefsFromProfile({
    ...BASE_PROFILE,
    targetRegions: regionIds,
    remoteScope: over.remoteScope ?? 'worldwide',
  } as never)

const BASE_PROFILE = {
  roleTypes: ['backend'],
  seniorityLevels: ['junior', 'mid'],
  locationPrefs: [],
  acceptRelocation: false,
  willingToRelocateTo: [],
  remoteScope: 'worldwide',
  keywords: [],
  dealbreakers: [],
  searchPrefsSavedAt: new Date('2026-10-01T00:00:00Z'),
  discoveryPrefs: { relocationIfSponsored: false },
}

const job = (location: string, extra: Partial<GateInput> = {}): GateInput => ({
  title: 'Laravel Developer',
  location,
  remoteType: 'onsite',
  descriptionMd: 'Build APIs in PHP and Laravel.',
  techStack: ['php', 'laravel'],
  ...extra,
})

const reasons = (location: string, p: SearchPrefs, extra: Partial<GateInput> = {}): string[] =>
  evaluateRelevance(job(location, extra), p).reasons.filter((r) => r.startsWith('location'))

describe('relevance gate — hierarchical region rule', () => {
  const kerala = prefs(['kerala'])
  const gcc = prefs(['gcc'])
  const dubai = prefs(['dubai'])

  it('Kerala accepts Kochi, Trivandrum (Technopark) and Calicut, and drops Bengaluru', () => {
    expect(reasons('Infopark, Kochi', kerala)).toEqual([])
    expect(reasons('Technopark, Trivandrum', kerala)).toEqual([])
    expect(reasons('Calicut', kerala)).toEqual([])
    expect(reasons('Bengaluru, Karnataka', kerala)).toEqual(['location: Bengaluru'])
    expect(reasons('Dubai', kerala)).toEqual(['location: Dubai'])
  })

  it('never drops a posting broader than the selection ("India" for Kerala)', () => {
    expect(reasons('India', kerala)).toEqual([])
  })

  it('GCC accepts every Gulf city and free zone', () => {
    for (const where of ['Dubai', 'DIFC', 'Riyadh, KSA', 'Doha', 'Muscat', 'Manama', 'Kuwait City', 'Al Ain']) {
      expect(reasons(where, gcc), where).toEqual([])
    }
    expect(reasons('Kochi', gcc)).toEqual(['location: Kochi'])
  })

  it('Dubai alone narrows: Abu Dhabi is out, a UAE-only posting passes as broader', () => {
    expect(reasons('JLT, Dubai', dubai)).toEqual([])
    expect(reasons('Abu Dhabi', dubai)).toEqual(['location: Abu Dhabi'])
    expect(reasons('United Arab Emirates', dubai)).toEqual([])
  })

  it('tags the posting with the deepest places, their ancestors and remote scopes', () => {
    expect(evaluateRelevance(job('Infopark, Kochi'), kerala).regionIds).toEqual(['kochi', 'kerala', 'in'])
    expect(evaluateRelevance(job('DIFC, Dubai'), gcc).regionIds).toEqual(['dubai', 'ae', 'gcc'])
    const remote = evaluateRelevance(job('Remote - India', { remoteType: 'remote' }), gcc).regionIds
    expect(remote).toEqual(expect.arrayContaining(['in', 'remote', 'remote-india-tz', 'remote-apac']))
    expect(evaluateRelevance(job('Remote - Worldwide', { remoteType: 'remote' }), gcc).regionIds).toContain('remote-worldwide')
    expect(evaluateRelevance(job('Remote (EMEA)', { remoteType: 'remote' }), gcc).regionIds).toContain('remote-emea')
    expect(evaluateRelevance(job('', { title: 'Laravel Developer Dubai' }), gcc).regionIds).toEqual(['dubai', 'ae', 'gcc'])
  })

  it('folds the selection into the relevance key', () => {
    expect(relevanceKey(kerala)).not.toBe(relevanceKey(prefs(['in'])))
  })
})

describe('match score — region component', () => {
  const kerala = matchProfile({ regionIds: ['kerala'], regions: ['IN'] })

  it('scores Kerala postings 10, broader India 7, elsewhere 0', () => {
    expect(regionComponent(matchJob({ location: 'Kochi, Kerala' }), kerala)).toMatchObject({ points: 10, label: 'Region: Kerala' })
    expect(regionComponent(matchJob({ location: 'India' }), kerala)).toMatchObject({ points: 7, label: 'Region: India (city not stated)' })
    expect(regionComponent(matchJob({ location: 'Pune' }), kerala).points).toBe(0)
  })

  it('a GCC selection covers every Gulf city', () => {
    const gcc = matchProfile({ regionIds: ['gcc'], regions: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'] })
    expect(regionComponent(matchJob({ location: 'Lusail, Qatar' }), gcc)).toMatchObject({ points: 10, label: 'Region: Qatar' })
    const dubai = matchProfile({ regionIds: ['dubai'], regions: ['AE'] })
    expect(regionComponent(matchJob({ location: 'JLT, Dubai' }), dubai)).toMatchObject({ points: 10, label: 'Region: Dubai' })
  })

  it('keeps working for country-only profiles', () => {
    expect(regionComponent(matchJob({ location: 'Dubai' }), matchProfile()).points).toBe(10)
  })

  it('a remote posting where the user lives is a full fit', () => {
    expect(regionComponent(matchJob({ location: 'Remote - India', remoteType: 'remote' }), kerala).points).toBe(10)
  })
})

describe('shortlist rank — region fit', () => {
  const cand = (over: Partial<RankCandidate>): RankCandidate => ({
    id: '00000000-0000-4000-8000-000000000001',
    matchScore: 60,
    fitScore: null,
    regions: [],
    families: [],
    notes: {},
    postedAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    riskLevel: null,
    quarantined: false,
    filtered: false,
    reputation: null,
    feedback: [],
    ...over,
  })
  const ctx = (targetRegions: string[]) => ({ now: new Date('2026-10-01T00:00:00Z'), targetFamilies: [], targetRegions })
  const region = (c: RankCandidate, targets: string[]) => rankCandidate(c, ctx(targets)).reasons.find((r) => r.label.startsWith('Region'))

  it('+8 within a targeted parent, +4 when broader, nothing elsewhere', () => {
    expect(region(cand({ regionIds: ['kochi', 'kerala', 'in'] }), ['kerala'])).toMatchObject({ label: 'Region: Kerala', points: 8 })
    expect(region(cand({ regionIds: ['dubai', 'ae', 'gcc'] }), ['gcc'])).toMatchObject({ label: 'Region: UAE', points: 8 })
    expect(region(cand({ regionIds: ['in'] }), ['kerala'])).toMatchObject({ points: 4 })
    expect(region(cand({ regionIds: ['bengaluru', 'karnataka', 'in'] }), ['kerala'])).toBeUndefined()
  })

  it('falls back to the coarse tags before the backfill reaches a row', () => {
    expect(region(cand({ regions: ['ae', 'gcc'] }), ['gcc'])).toMatchObject({ points: 8 })
  })

  it('targets the selection plus remote while remote roles are accepted', () => {
    expect(rankTargets(prefs(['kerala']))).toEqual(['kerala', 'remote'])
    expect(rankTargets(prefs(['kerala'], { remoteScope: 'none' }))).toEqual(['kerala'])
  })
})

describe('best CV — region fit', () => {
  it('a GCC variant fits any GCC node, an India variant any India node', () => {
    for (const where of ['GCC', 'UAE', 'Dubai', 'DIFC, Dubai', 'Riyadh', 'Muscat, Oman']) {
      expect(jobRegions(job(where)), where).toEqual(['gcc'])
      expect(regionFit('gcc', jobRegions(job(where))).points).toBe(15)
    }
    for (const where of ['India', 'Kerala', 'Technopark, Trivandrum', 'Calicut', 'Bengaluru']) {
      expect(jobRegions(job(where)), where).toEqual(['india'])
    }
    expect(regionFit('india', jobRegions(job('Dubai'))).points).toBe(0)
  })

  it('reads western postings as remote-convention', () => {
    expect(jobRegions(job('Berlin, Germany'))).toEqual(['remote'])
  })
})

describe('photo advice — country', () => {
  it('treats every GCC node as GCC and names the country', () => {
    expect(photoCountry({ title: 'Developer', location: 'DIFC, Dubai' })).toEqual({ kind: 'gcc', label: 'UAE' })
    expect(photoCountry({ title: 'Developer', location: 'GCC' })).toEqual({ kind: 'gcc', label: 'GCC' })
    expect(photoCountry({ title: 'Developer', location: 'Infopark, Kochi' })).toEqual({ kind: 'india', label: 'India' })
  })
})

describe('GCC location view (parseGccLocation) over the normaliser', () => {
  it('keeps returning { country, city }', () => {
    expect(parseGccLocation('JLT, Dubai')).toMatchObject({ countryCode: 'AE', city: 'Dubai' })
    expect(parseGccLocation('Eastern Province, Saudi Arabia')).toMatchObject({ countryCode: 'SA', city: null })
    expect(parseGccLocation('Kochi, Kerala')).toBeNull()
  })
})

describe('stored preferences — migration from location_prefs', () => {
  const legacy = (codes: string[]) =>
    ({ ...BASE_PROFILE, locationPrefs: codes.map((country) => ({ country, cities: [], priority: 1 })) }) as unknown as UserProfile

  it('maps old country codes losslessly (six GCC countries → gcc)', () => {
    expect(targetRegionIds(legacy(['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN']))).toEqual(['in', 'gcc'])
    expect(targetRegionIds(legacy(['AE', 'GB']))).toEqual(['ae'])
    const p = searchPrefsFromProfile(legacy(['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN']))
    expect(p.regions).toEqual(['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'])
    expect(p.regionIds).toEqual(['in', 'gcc'])
  })

  it('prefers the saved node ids once present', () => {
    const p = searchPrefsFromProfile({ ...legacy(['AE', 'IN']), targetRegions: ['kerala', 'dubai'] } as UserProfile)
    expect(p.regionIds).toEqual(['kerala', 'dubai'])
    expect(p.regions).toEqual(['AE', 'IN'])
  })

  it('gates a migrated profile exactly like before', () => {
    const p = searchPrefsFromProfile(legacy(['AE', 'IN']))
    expect(reasons('Dubai', p)).toEqual([])
    expect(reasons('Riyadh', p)).toEqual(['location: Riyadh'])
    expect(reasons('Bengaluru', p)).toEqual([])
  })

  it('shows the selection in Settings and the summary card', () => {
    const profile = { ...legacy(['AE']), targetRegions: ['kerala', 'dubai'] } as UserProfile
    expect(searchPrefsFormValues(profile).regions).toEqual(['kerala', 'dubai'])
    expect(lookingForView(profile).regions).toEqual(['Kerala', 'Dubai'])
  })
})

describe('Settings form — target regions', () => {
  const form = (values: string[]): FormData => {
    const fd = new FormData()
    for (const v of values) fd.append('region', v)
    fd.set('remoteScope', 'worldwide')
    return fd
  }

  it('stores node ids, plus the countries they touch in location_prefs', () => {
    const patch = searchPrefsPatch(form(['kerala', 'dubai']), null, new Date('2026-10-01T00:00:00Z'))
    expect(patch.targetRegions).toEqual(['kerala', 'dubai'])
    expect((patch.locationPrefs as Array<{ country: string }>).map((l) => l.country)).toEqual(['AE', 'IN'])
  })

  it('accepts legacy codes and drops non-target or unknown ids', () => {
    expect(targetRegionsFromForm(form(['AE', 'IN']))).toEqual(['ae', 'in'])
    expect(targetRegionsFromForm(form(['remote', 'de', 'atlantis', 'kochi']))).toEqual(['kochi'])
  })

  it('keeps EMPTY_PREFS free of selections', () => {
    expect(EMPTY_PREFS.regionIds).toEqual([])
  })
})
