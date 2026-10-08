import { describe, expect, it } from 'vitest'
import { COUNTRY_CODES, countryName, parseCountryCsv, searchCountries } from '@/lib/ui/countries'

describe('countries', () => {
  it('lists the ISO codes once each', () => {
    expect(COUNTRY_CODES.length).toBe(249)
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length)
  })

  it('names countries in English', () => {
    expect(countryName('SG')).toBe('Singapore')
    expect(countryName('DE')).toBe('Germany')
  })

  it('reads stored CSV, dropping city names and unknown codes', () => {
    expect(parseCountryCsv('sg, Dubai, DE, de, xx')).toEqual(['SG', 'DE'])
  })

  it('finds by code first, then by name', () => {
    expect(searchCountries('de')[0]?.code).toBe('DE')
    expect(searchCountries('singa').map((c) => c.code)).toEqual(['SG'])
    expect(searchCountries('germ', ['DE'])).toEqual([])
  })
})
