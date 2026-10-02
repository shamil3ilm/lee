import { describe, expect, it } from 'vitest'
import { DEFAULT_COUNTRIES, DEFAULT_KEYWORDS, buildSearchPrefs } from '@/lib/discovery/search-prefs'

describe('buildSearchPrefs', () => {
  it('defaults to backend / full-stack in the GCC and India, junior + mid', () => {
    expect(buildSearchPrefs({}, null)).toEqual({
      keywords: [...DEFAULT_KEYWORDS],
      countries: [...DEFAULT_COUNTRIES],
      seniority: ['junior', 'mid'],
    })
  })

  it('uses the profile: role types become searches, location prefs become countries', () => {
    const prefs = buildSearchPrefs(
      {},
      {
        roleTypes: ['Backend', 'full-stack', 'Platform Engineer'],
        keywords: ['node.js'],
        seniority: 'mid',
        locationPrefs: [{ country: 'ae' }, { country: 'IN', region: 'Kerala' }, { country: 'IN' }, { nope: 1 }],
      },
    )
    expect(prefs.keywords).toEqual(['backend developer', 'full stack developer', 'platform engineer'])
    expect(prefs.countries).toEqual(['AE', 'IN'])
    expect(prefs.seniority).toEqual(['junior', 'mid'])
  })

  it('source config wins over the profile', () => {
    const prefs = buildSearchPrefs({ keywords: 'golang developer', countries: ['sa'] }, { roleTypes: ['Backend'], seniority: 'senior' })
    expect(prefs).toEqual({ keywords: ['golang developer'], countries: ['SA'], seniority: ['mid', 'senior'] })
  })

  it('ignores junk config', () => {
    expect(buildSearchPrefs({ countries: ['United Arab Emirates', 'x1'] }, null).countries).toEqual([...DEFAULT_COUNTRIES])
    expect(buildSearchPrefs('nonsense', null).keywords).toEqual([...DEFAULT_KEYWORDS])
  })
})
