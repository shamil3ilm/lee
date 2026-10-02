import { describe, expect, it } from 'vitest'
import { scanPlaces } from '@/lib/discovery/relevance/places'
import { normalizeForMatch, repairMojibake } from '@/lib/discovery/relevance/text'

/**
 * The gate must never drop a Gulf or Indian posting over a spelling. Every
 * alias below is how real boards write these places.
 */
const GCC_AND_INDIA: ReadonlyArray<[string, string]> = [
  ['Dubai', 'AE'], ['Dubai, United Arab Emirates', 'AE'], ['Abu Dhabi', 'AE'], ['AbuDhabi', 'AE'],
  ['Abu-Dhabi, UAE', 'AE'], ['Sharjah', 'AE'], ['U.A.E.', 'AE'], ['UAE', 'AE'], ['Dubai, AE', 'AE'],
  ['Ras Al Khaimah', 'AE'], ['Al Ain', 'AE'], ['Jebel Ali Free Zone', 'AE'], ['DIFC, Dubai', 'AE'],
  ['دبي', 'AE'], ['أبوظبي', 'AE'], ['الإمارات العربية المتحدة', 'AE'],
  ['Riyadh', 'SA'], ['Riyadh, KSA', 'SA'], ['Jeddah', 'SA'], ['Jiddah', 'SA'], ['Al Khobar', 'SA'],
  ['Al-Khobar', 'SA'], ['Dammam', 'SA'], ['Dhahran', 'SA'], ['NEOM', 'SA'], ['Saudi Arabia', 'SA'],
  ['Kingdom of Saudi Arabia', 'SA'], ['KSA', 'SA'], ['الرياض', 'SA'], ['جدة', 'SA'],
  ['Doha', 'QA'], ['Doha, Qatar', 'QA'], ['Lusail', 'QA'], ['الدوحة', 'QA'],
  ['Kuwait City', 'KW'], ['Kuwait', 'KW'], ['Salmiya', 'KW'], ['الكويت', 'KW'],
  ['Manama', 'BH'], ['Manama, Bahrain', 'BH'], ['Muharraq', 'BH'], ['البحرين', 'BH'],
  ['Muscat', 'OM'], ['Muscat, Oman', 'OM'], ['Salalah', 'OM'], ['مسقط', 'OM'], ['عُمان', 'OM'],
  ['Bengaluru', 'IN'], ['Bangalore', 'IN'], ['Bengaluru, Karnataka, India', 'IN'], ['Kochi', 'IN'],
  ['Cochin', 'IN'], ['Kochi, Kerala', 'IN'], ['Infopark Kakkanad', 'IN'], ['Technopark, Trivandrum', 'IN'],
  ['Thiruvananthapuram', 'IN'], ['Hyderabad', 'IN'], ['Chennai', 'IN'], ['Pune', 'IN'], ['Mumbai', 'IN'],
  ['Navi Mumbai', 'IN'], ['Gurgaon', 'IN'], ['Gurugram, Haryana', 'IN'], ['Noida', 'IN'],
  ['Delhi NCR', 'IN'], ['New Delhi', 'IN'], ['Remote - India', 'IN'], ['Remote (India)', 'IN'],
  ['India (Remote)', 'IN'], ['Pan India', 'IN'], ['Kozhikode', 'IN'], ['Calicut', 'IN'],
]

describe('scanPlaces — GCC and India aliases', () => {
  it.each(GCC_AND_INDIA)('%s → %s', (location, code) => {
    expect([...scanPlaces(location, { trustCodes: true }).regions]).toContain(code)
  })

  it('treats Gulf and Indian places as target regions, never as foreign', () => {
    for (const [location] of GCC_AND_INDIA) {
      expect(scanPlaces(location, { trustCodes: true }).foreign.size).toBe(0)
    }
  })

  it('does not read "Indiana" or "Indianapolis" as India', () => {
    expect(scanPlaces('Indianapolis, Indiana', { trustCodes: true }).regions.has('IN')).toBe(false)
  })

  it('recognises broad areas that cover the Gulf and India', () => {
    expect([...scanPlaces('Remote - EMEA').covered]).toEqual(expect.arrayContaining(['AE', 'SA']))
    expect([...scanPlaces('Middle East').covered]).toContain('QA')
    expect([...scanPlaces('APAC').covered]).toContain('IN')
    expect([...scanPlaces('UTC+4 ± 2h').covered]).toContain('AE')
    expect(scanPlaces('Worldwide').worldwide).toBe(true)
    expect(scanPlaces('Anywhere').worldwide).toBe(true)
  })

  it('recognises foreign places', () => {
    expect([...scanPlaces('Remote - US', { trustCodes: true }).foreign]).toEqual(['US'])
    expect([...scanPlaces('Austin, Texas, United States').foreign]).toEqual(['US'])
    expect([...scanPlaces('London, England, United Kingdom').foreign]).toEqual(['GB'])
    expect([...scanPlaces('LATAM').foreign]).toEqual(['LATAM'])
    expect(scanPlaces('Latin America').foreign.has('US')).toBe(false)
  })

  it('does not trust bare codes outside a location field', () => {
    expect(scanPlaces('join us for coffee').foreign.size).toBe(0)
  })
})

describe('encoding repair', () => {
  it('repairs RemoteOK double-encoded Arabic locations', () => {
    // "دبي, دبي دبي الإمارات العربية المتحدة" as RemoteOK serves it.
    const utf8 = new TextEncoder().encode('دبي, دبي دبي الإمارات العربية المتحدة')
    const mojibake = String.fromCharCode(...utf8)
    expect(repairMojibake(mojibake)).toBe('دبي, دبي دبي الإمارات العربية المتحدة')
    expect([...scanPlaces(mojibake).regions]).toEqual(['AE'])
  })

  it('repairs Latin mojibake and leaves clean text alone', () => {
    const utf8 = new TextEncoder().encode('Islāmābād')
    expect(repairMojibake(String.fromCharCode(...utf8))).toBe('Islāmābād')
    expect(repairMojibake('Zürich')).toBe('Zürich')
    expect(repairMojibake('Dubai')).toBe('Dubai')
  })

  it('folds accents, Arabic letter variants and case', () => {
    expect(normalizeForMatch('  São  Paulo ')).toBe('sao paulo')
    expect(normalizeForMatch('أبوظبي')).toBe(normalizeForMatch('ابوظبي'))
  })
})
