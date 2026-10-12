import { describe, expect, it } from 'vitest'
import { resolveLocation } from '@/lib/regions/normalize'
import { sharedAliasKeys } from '@/lib/regions/matcher'
import { parseGccLocation } from '@/lib/discovery/relevance/location'
import { locationMatchesCountries } from '@/lib/discovery/search-prefs'

/**
 * Kuwait districts as employers write them (taxonomy t3): BambooHR's
 * "Jahrah" (American International University), campus addresses in
 * Saad Al Abdullah, Egaila, Mishref, hospitals in Dasma or Sabah Al Salem.
 * Each resolves to its governorate town and so to Kuwait.
 */

const AREAS: ReadonlyArray<readonly [string, string, string]> = [
  ['Saad Al Abdullah, Kuwait', 'jahra', 'Saad Al Abdullah'],
  ['Saad Al-Abdullah City', 'jahra', 'Saad Al Abdullah'],
  ['Sulaibiya', 'jahra', 'Sulaibiya'],
  ['Sabah Al Ahmad City', 'ahmadi', 'Sabah Al Ahmad'],
  ['Sabah Al-Ahmad Sea City', 'ahmadi', 'Sabah Al Ahmad'],
  ['Egaila, Kuwait', 'ahmadi', 'Egaila'],
  ['Al-Egaila', 'ahmadi', 'Egaila'],
  ['Khairan', 'ahmadi', 'Khairan'],
  ['Wafra', 'ahmadi', 'Wafra'],
  ['Sabah Al Salem', 'mubarak-al-kabeer', 'Sabah Al Salem'],
  ['Messila', 'mubarak-al-kabeer', 'Messila'],
  ['Mishref', 'hawalli', 'Mishref'],
  ['West Mishref, Kuwait', 'hawalli', 'West Mishref'],
  ['Kaifan', 'kuwait-city', 'Kaifan'],
  ['Kifan, Kuwait', 'kuwait-city', 'Kaifan'],
  ['Dasma', 'kuwait-city', 'Dasma'],
  ['Shamiya', 'kuwait-city', 'Shamiya'],
  ['Khaldiya', 'kuwait-city', 'Khaldiya'],
  ['Khaitan', 'farwaniya', 'Khaitan'],
  ['Sabah Al Nasser', 'farwaniya', 'Sabah Al Nasser'],
]

describe('Kuwait districts (taxonomy t3)', () => {
  it.each(AREAS)('%s → %s (%s)', (raw, id, area) => {
    expect(resolveLocation(raw, { trustCodes: true }).places).toEqual([{ id, area }])
  })

  it.each(['Jahrah', 'Jahrah, Kuwait', 'Al Jahrah', 'Al-Jahra', 'Jahra'])('%s → Jahra', (raw) => {
    expect(resolveLocation(raw, { trustCodes: true }).places.map((p) => p.id)).toEqual(['jahra'])
  })

  it('tags the AIU BambooHR location as Kuwait (country and GCC ancestors stored)', () => {
    expect(resolveLocation('Jahrah, Kuwait').ids).toEqual(expect.arrayContaining(['jahra', 'kw', 'gcc']))
    expect(parseGccLocation('Jahrah, Kuwait')).toEqual({ countryCode: 'KW', country: 'Kuwait', city: 'Jahra' })
    expect(locationMatchesCountries('Saad Al Abdullah', ['KW'])).toBe(true)
  })

  it('keeps Dasma (Capital) apart from Dasman', () => {
    expect(resolveLocation('Dasman').places).toEqual([{ id: 'kuwait-city', area: 'Dasman' }])
    expect(resolveLocation('Dasma').places).toEqual([{ id: 'kuwait-city', area: 'Dasma' }])
  })

  it('no alias key names two different places', () => {
    expect(sharedAliasKeys()).toEqual([])
  })
})
