import { describe, expect, it } from 'vitest'
import { normalizePreferred, parsePreferredValues, preferredHit, preferredPoints, PREFERRED_BOOST, type PreferredRegion } from '@/lib/regions/preferred'
import { regionComponent } from '@/lib/discovery/match/fit'
import { REGION_MAX } from '@/lib/discovery/match/region'
import { matchKey } from '@/lib/discovery/match/key'
import { rankCandidate, type RankCandidate } from '@/lib/apply/rank'
import { parseDiscoveryPrefs } from '@/lib/discovery/relevance/discovery-prefs'
import { discoveryPrefsFromForm } from '@/lib/discovery/relevance/form'
import { matchJob, matchProfile } from './discovery-match-helpers'

const STARS: PreferredRegion[] = [
  { id: 'ae', level: 'top' },
  { id: 'kw', level: 'top' },
  { id: 'kerala', level: 'preferred' },
]

describe('preferredHit (hierarchy and levels)', () => {
  it('a starred country covers its cities; a starred city only itself', () => {
    expect(preferredHit(['dubai'], STARS)).toMatchObject({ id: 'ae', level: 'top', label: 'Preferred: UAE' })
    expect(preferredHit(['kuwait-city'], STARS)).toMatchObject({ id: 'kw', label: 'Preferred: Kuwait' })
    expect(preferredHit(['kochi'], STARS)).toMatchObject({ level: 'preferred' })
    const cityOnly: PreferredRegion[] = [{ id: 'dubai', level: 'preferred' }]
    expect(preferredHit(['dubai'], cityOnly)).not.toBeNull()
    expect(preferredHit(['abu-dhabi'], cityOnly)).toBeNull()
    expect(preferredHit(['ae'], cityOnly)).toBeNull()
  })

  it('unstarred GCC countries get no boost (never a filter)', () => {
    for (const id of ['riyadh', 'doha', 'manama', 'muscat']) expect(preferredHit([id], STARS)).toBeNull()
  })

  it('the higher level wins; equal levels go to the more specific star', () => {
    const stars: PreferredRegion[] = [
      { id: 'ae', level: 'preferred' },
      { id: 'dubai', level: 'top' },
    ]
    expect(preferredHit(['dubai'], stars)).toMatchObject({ id: 'dubai', level: 'top', label: 'Preferred: Dubai' })
    expect(preferredHit(['sharjah'], stars)).toMatchObject({ id: 'ae', level: 'preferred' })
    expect(preferredPoints(preferredHit(['dubai'], stars), 'match')).toBe(PREFERRED_BOOST.match.top)
    expect(preferredPoints(preferredHit(['sharjah'], stars), 'match')).toBe(PREFERRED_BOOST.match.preferred)
    expect(PREFERRED_BOOST.match.top).toBeGreaterThan(PREFERRED_BOOST.match.preferred)
  })

  it('parses form values and the stored list leniently', () => {
    expect(parsePreferredValues(['kw:top', 'ae:preferred', 'kw:preferred', 'nowhere:top', 'qa:bogus'])).toEqual([
      { id: 'kw', level: 'top' },
      { id: 'ae', level: 'preferred' },
    ])
    expect(normalizePreferred([null, { id: 'om', level: 'top' }])).toEqual([{ id: 'om', level: 'top' }])
    expect(parseDiscoveryPrefs({ preferredRegions: [{ id: 'kw', level: 'top' }] }).preferredRegions).toEqual([{ id: 'kw', level: 'top' }])
    expect(parseDiscoveryPrefs({}).preferredRegions).toEqual([])
    const fd = new FormData()
    fd.append('preferredRegion', 'kw:top')
    fd.append('preferredRegion', 'ae:top')
    fd.append('companyStage', 'startup')
    expect(discoveryPrefsFromForm(fd)).toMatchObject({ preferredRegions: [{ id: 'kw', level: 'top' }, { id: 'ae', level: 'top' }], companyStages: ['startup'] })
  })
})

describe('Match Score region component with stars', () => {
  const starred = (stars: PreferredRegion[]) => matchProfile({ extra: { ...matchProfile().extra, preferredRegions: stars } })

  it('adds +5 for a top-priority region and +3 for a preferred one, labelled', () => {
    const kw = regionComponent(matchJob({ location: 'Kuwait City, Kuwait' }), starred(STARS))
    expect(kw).toMatchObject({ points: REGION_MAX + 5, max: REGION_MAX + 5 })
    expect(kw.label).toContain('Preferred: Kuwait')
    const kochi = regionComponent(matchJob({ location: 'Kochi, Kerala' }), starred(STARS))
    expect(kochi.points).toBe(REGION_MAX + 3)
  })

  it('leaves unstarred regions at their normal weight', () => {
    const riyadh = regionComponent(matchJob({ location: 'Riyadh, Saudi Arabia' }), starred(STARS))
    expect(riyadh).toMatchObject({ points: REGION_MAX, max: REGION_MAX })
    expect(riyadh.label).not.toContain('Preferred')
  })

  it('stars are part of the match key (re-score on change)', () => {
    expect(matchKey(starred(STARS))).not.toBe(matchKey(starred([])))
  })
})

describe('shortlist rank with stars', () => {
  const NOW = new Date('2026-10-07T08:00:00Z')
  const cand = (regionIds: string[]): RankCandidate => ({
    id: '00000000-0000-4000-8000-000000000001',
    matchScore: 70,
    fitScore: null,
    regions: [],
    regionIds,
    families: [],
    notes: {},
    postedAt: null,
    createdAt: NOW,
    riskLevel: 'safe',
    quarantined: false,
    filtered: false,
    reputation: null,
    feedback: [],
  })
  const ctx = { now: NOW, targetFamilies: [], targetRegions: ['gcc'], preferredRegions: STARS }

  it('adds a "Preferred: UAE" reason worth more for top priority than for preferred', () => {
    const dubai = rankCandidate(cand(['dubai', 'ae', 'gcc']), ctx)
    const doha = rankCandidate(cand(['doha', 'qa', 'gcc']), ctx)
    expect(dubai.reasons.find((r) => r.label === 'Preferred: UAE')?.points).toBe(PREFERRED_BOOST.rank.top)
    expect(doha.reasons.some((r) => r.label.startsWith('Preferred'))).toBe(false)
    expect(dubai.score - doha.score).toBe(PREFERRED_BOOST.rank.top)
  })
})
