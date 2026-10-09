import { describe, expect, it } from 'vitest'
import {
  checkState,
  expandSelection,
  isCovered,
  migrateLegacyRegions,
  normalizeSelection,
  parseRegionParam,
  pickRegion,
  regionMatch,
  selectionCountries,
  serializeRegionParam,
  toggleRegion,
} from '@/lib/regions/selection'
import { childrenOf, descendantsOf, getNode, primaryChain } from '@/lib/regions/tree'
import { chainLabel, locationDisplay, placeLabel, placeName, regionGroups } from '@/lib/regions/display'
import { searchRegions, selectionSummary } from '@/lib/regions/picker'
import { REGION_NODES, ROOT_ORDER } from '@/lib/regions/taxonomy'
import { mergeQuery } from '@/lib/ui/filter-query'

describe('taxonomy', () => {
  it('has unique ids and known parents', () => {
    const ids = REGION_NODES.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const n of REGION_NODES) for (const p of n.parents) expect(getNode(p), `${n.id} → ${p}`).toBeDefined()
  })

  it('every top-level node is in the display order', () => {
    const roots = REGION_NODES.filter((n) => n.parents.length === 0).map((n) => n.id)
    expect([...roots].sort()).toEqual([...ROOT_ORDER].sort())
  })

  it('GCC holds the six countries and their cities', () => {
    expect(childrenOf('gcc')).toEqual(['ae', 'sa', 'qa', 'kw', 'bh', 'om'])
    expect(descendantsOf('gcc').has('dubai')).toBe(true)
    expect(descendantsOf('gcc').has('al-ain')).toBe(true)
    expect(descendantsOf('gcc').has('kochi')).toBe(false)
  })

  it('Kerala holds Kochi, Trivandrum and Kozhikode; Delhi NCR spans two states', () => {
    const kerala = descendantsOf('kerala')
    for (const city of ['kochi', 'thiruvananthapuram', 'kozhikode', 'thrissur', 'kannur', 'kollam']) expect(kerala.has(city)).toBe(true)
    expect(descendantsOf('delhi-ncr').has('gurugram')).toBe(true)
    expect(descendantsOf('haryana').has('gurugram')).toBe(true)
    expect(descendantsOf('uttar-pradesh').has('noida')).toBe(true)
    expect(primaryChain('kochi')).toEqual(['kochi', 'kerala', 'in'])
  })
})

describe('selection semantics', () => {
  it('a parent includes its descendants', () => {
    expect(isCovered('dubai', ['gcc'])).toBe(true)
    expect(isCovered('kochi', ['kerala'])).toBe(true)
    expect(isCovered('kochi', ['in'])).toBe(true)
    expect(isCovered('bengaluru', ['kerala'])).toBe(false)
    expect(isCovered('dubai', ['in'])).toBe(false)
  })

  it('a child alone narrows', () => {
    expect(isCovered('dubai', ['dubai'])).toBe(true)
    expect(isCovered('abu-dhabi', ['dubai'])).toBe(false)
    expect(isCovered('ae', ['dubai'])).toBe(false)
  })

  it('normalises: unknown ids dropped, children under a selected parent dropped', () => {
    expect(normalizeSelection(['kochi', 'kerala', 'nowhere', 'kerala'])).toEqual(['kerala'])
    expect(normalizeSelection(['dubai', 'kochi'])).toEqual(['dubai', 'kochi'])
  })

  it('ticking a parent replaces its selected children', () => {
    expect(toggleRegion(['kochi', 'dubai'], 'kerala')).toEqual(['dubai', 'kerala'])
  })

  it('unticking a child of a selected parent keeps its siblings', () => {
    const next = toggleRegion(['ae'], 'dubai')
    expect(next).not.toContain('ae')
    expect(next).not.toContain('dubai')
    expect(next).toEqual(expect.arrayContaining(['abu-dhabi', 'sharjah', 'ajman']))
    // Two levels down: GCC minus Dubai = the other five countries + the other emirates.
    const deep = toggleRegion(['gcc'], 'dubai')
    expect(deep).toEqual(expect.arrayContaining(['sa', 'qa', 'kw', 'bh', 'om', 'abu-dhabi']))
    expect(deep).not.toContain('gcc')
    expect(isCovered('riyadh', deep)).toBe(true)
    expect(isCovered('dubai', deep)).toBe(false)
  })

  it('a quick pick narrows a selected ancestor and widens over selected children', () => {
    expect(pickRegion(['gcc', 'in'], 'kerala')).toEqual(['gcc', 'kerala'])
    expect(pickRegion(['kochi', 'dubai'], 'kerala')).toEqual(['dubai', 'kerala'])
    expect(pickRegion(['kerala'], 'kerala')).toEqual([])
    expect(pickRegion([], 'remote')).toEqual(['remote'])
  })

  it('unticking a selected node removes it', () => {
    expect(toggleRegion(['kerala', 'dubai'], 'kerala')).toEqual(['dubai'])
  })

  it('reports picker states: checked, mixed, unchecked', () => {
    expect(checkState('kochi', ['kerala'])).toBe('checked')
    expect(checkState('kerala', ['kochi'])).toBe('indeterminate')
    expect(checkState('in', ['kochi'])).toBe('indeterminate')
    expect(checkState('gcc', ['kochi'])).toBe('unchecked')
  })

  it('matches postings through ancestors and descendants', () => {
    expect(regionMatch(['kochi', 'kerala', 'in'], ['kerala'])).toBe('in')
    expect(regionMatch(['dubai', 'ae', 'gcc'], ['gcc'])).toBe('in')
    expect(regionMatch(['in'], ['kerala'])).toBe('partial')
    expect(regionMatch(['bengaluru', 'karnataka', 'in'], ['kerala'])).toBe('out')
    expect(regionMatch([], ['kerala'])).toBe('none')
    expect(regionMatch(['remote'], ['remote-apac'])).toBe('out')
  })

  it('expands a selection and lists the countries it touches', () => {
    expect(expandSelection(['kerala'])).toEqual(expect.arrayContaining(['kerala', 'kochi', 'kozhikode']))
    expect(selectionCountries(['kerala'])).toEqual(['IN'])
    expect(selectionCountries(['gcc']).sort()).toEqual(['AE', 'BH', 'KW', 'OM', 'QA', 'SA'])
    expect(selectionCountries(['dubai', 'kochi']).sort()).toEqual(['AE', 'IN'])
  })
})

describe('stored-prefs migration', () => {
  it('maps country codes and old filter tags to node ids', () => {
    expect(migrateLegacyRegions(['AE', 'IN'])).toEqual(['ae', 'in'])
    expect(migrateLegacyRegions(['gcc', 'remote'])).toEqual(['gcc', 'remote'])
    expect(migrateLegacyRegions(['ae', 'in', 'remote'])).toEqual(['ae', 'in', 'remote'])
  })

  it('collapses all six GCC countries to the group (the same set)', () => {
    expect(migrateLegacyRegions(['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'])).toEqual(['in', 'gcc'])
    expect(migrateLegacyRegions(['AE', 'SA'])).toEqual(['ae', 'sa'])
  })

  it('is lossless: every legacy country covers the same postings as before', () => {
    const legacy = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN']
    const migrated = migrateLegacyRegions(legacy)
    for (const code of legacy) expect(isCovered(code.toLowerCase(), migrated)).toBe(true)
    expect(selectionCountries(migrated).sort()).toEqual([...legacy].sort())
  })

  it('drops junk', () => {
    expect(migrateLegacyRegions(['XX', 42, null, 'atlantis', ' IN '])).toEqual(['in'])
  })
})

describe('filter URL round-trip', () => {
  it('parses and serialises', () => {
    expect(parseRegionParam('kerala,dubai')).toEqual(['kerala', 'dubai'])
    expect(serializeRegionParam(['kerala', 'dubai'])).toBe('kerala,dubai')
    expect(parseRegionParam(serializeRegionParam(['gcc', 'kochi', 'remote']))).toEqual(['gcc', 'kochi', 'remote'])
  })

  it('keeps old single-tag links working', () => {
    for (const tag of ['ae', 'gcc', 'in', 'remote']) expect(parseRegionParam(tag)).toEqual([tag])
  })

  it('ignores junk and redundant ids', () => {
    expect(parseRegionParam('kerala,kochi,<script>,,')).toEqual(['kerala'])
    expect(parseRegionParam(undefined)).toEqual([])
    expect(parseRegionParam('')).toEqual([])
  })

  it('survives a query-string merge (page reset, other params kept)', () => {
    const q = mergeQuery('tab=jobs&page=3&sort=match', { region: serializeRegionParam(['kerala', 'dubai']) })
    const sp = new URLSearchParams(q)
    expect(sp.get('page')).toBeNull()
    expect(sp.get('sort')).toBe('match')
    expect(parseRegionParam(sp.get('region'))).toEqual(['kerala', 'dubai'])
  })
})

describe('display', () => {
  it('labels the most specific place', () => {
    expect(placeName('kochi')).toBe('Kochi, Kerala')
    expect(placeName('dubai')).toBe('Dubai, UAE')
    expect(placeName('kerala')).toBe('Kerala, India')
    expect(placeName('ae')).toBe('UAE')
    expect(placeName('gurugram')).toBe('Gurugram, Delhi NCR')
    expect(placeLabel({ id: 'kochi', area: 'Infopark' })).toBe('Kochi, Kerala · Infopark')
    expect(placeLabel({ id: 'dubai', area: 'DIFC' })).toBe('Dubai, UAE · DIFC')
  })

  it('shows the chain on hover and counts extra places', () => {
    expect(chainLabel('kochi')).toBe('Kochi › Kerala › India')
    expect(locationDisplay('Infopark, Kakkanad')).toEqual({ label: 'Kochi, Kerala · Infopark', chain: 'Kochi › Kerala › India', more: 0 })
    expect(locationDisplay('Bangalore / Hyderabad')?.more).toBe(1)
    expect(locationDisplay('Somewhere nice')).toEqual({ label: 'Somewhere nice', chain: null, more: 0 })
    expect(locationDisplay('')).toBeNull()
  })

  it('groups counts GCC → country → city', () => {
    const counts = new Map([['gcc', 3], ['ae', 2], ['dubai', 2], ['sa', 1], ['riyadh', 1], ['in', 1], ['kerala', 1], ['kochi', 1]])
    const groups = regionGroups(counts)
    expect(groups.map((g) => [g.id, g.count])).toEqual([['gcc', 3], ['in', 1]])
    expect(groups[0]!.children.map((c) => c.id)).toEqual(['ae', 'sa'])
    expect(groups[0]!.children[0]!.children.map((c) => c.id)).toEqual(['dubai'])
  })
})

describe('picker helpers', () => {
  it('finds places by name, old spelling, IT park and free zone', () => {
    expect(searchRegions('koch', ['gcc', 'in'])[0]!.id).toBe('kochi')
    expect(searchRegions('cochin', ['in'])[0]).toEqual({ id: 'kochi', matched: 'cochin' })
    expect(searchRegions('technopark', ['in'])[0]!.id).toBe('thiruvananthapuram')
    expect(searchRegions('difc', ['gcc'])[0]!.id).toBe('dubai')
    expect(searchRegions('dubai', ['in'])).toEqual([])
    expect(searchRegions('', ['in'])).toEqual([])
  })

  it('summarises the selection', () => {
    expect(selectionSummary([], 'All regions')).toBe('All regions')
    expect(selectionSummary(['kerala', 'ae'], 'All')).toBe('Kerala, UAE')
    expect(selectionSummary(['kerala', 'ae', 'remote'], 'All')).toBe('Kerala, UAE +1')
  })
})
