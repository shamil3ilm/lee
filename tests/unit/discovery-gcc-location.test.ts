import { describe, expect, it } from 'vitest'
import { parseGccLocation } from '@/lib/discovery/relevance/location'
import { scanPlaces } from '@/lib/discovery/relevance/places'

/**
 * Location strings as GCC boards and ATS backends write them (checked live
 * 2026-10-08): Workday "AE - Dubai, United Arab Emirates", Oracle
 * "Dubai, United Arab Emirates", SuccessFactors "Riyadh, SA" or a bare
 * "SA", Workable "Riyadh, Riyadh Province, Saudi Arabia", Arabic names
 * and RemoteOK's double-encoded UTF-8.
 */
const mojibake = (s: string): string => String.fromCharCode(...new TextEncoder().encode(s))

const CASES: ReadonlyArray<[string, string, string | null]> = [
  // UAE
  ['Dubai', 'AE', 'Dubai'],
  ['Dubai - UAE', 'AE', 'Dubai'],
  ['Dubai, United Arab Emirates', 'AE', 'Dubai'],
  ['Dubai, Dubai, United Arab Emirates', 'AE', 'Dubai'],
  ['AE - Dubai, United Arab Emirates', 'AE', 'Dubai'],
  ['United Arab Emirates - Dubai', 'AE', 'Dubai'],
  ['Dubai, AE', 'AE', 'Dubai'],
  ['UAE', 'AE', null],
  ['U.A.E.', 'AE', null],
  ['AE', 'AE', null],
  ['ARE', 'AE', null],
  ['United Arab Emirates', 'AE', null],
  ['دبي', 'AE', 'Dubai'],
  ['دبي، الإمارات العربية المتحدة', 'AE', 'Dubai'],
  ['Abu Dhabi, United Arab Emirates', 'AE', 'Abu Dhabi'],
  ['AbuDhabi', 'AE', 'Abu Dhabi'],
  ['MBZ City, Abu Dhabi, United Arab Emirates', 'AE', 'Abu Dhabi'],
  ['أبوظبي', 'AE', 'Abu Dhabi'],
  ['أبو ظبي', 'AE', 'Abu Dhabi'],
  ['Al Ain, Abu Dhabi, AE', 'AE', 'Al Ain'],
  ['Sharjah', 'AE', 'Sharjah'],
  ['الشارقة', 'AE', 'Sharjah'],
  ['Ras Al Khaimah', 'AE', 'Ras Al Khaimah'],
  ['DIFC, Dubai', 'AE', 'Dubai'],
  // Saudi Arabia
  ['Riyadh', 'SA', 'Riyadh'],
  ['Riyadh, SA', 'SA', 'Riyadh'],
  ['Riyadh, KSA', 'SA', 'Riyadh'],
  ['Saudi Arabia - Riyadh', 'SA', 'Riyadh'],
  ['SA - Riyadh, Saudi Arabia', 'SA', 'Riyadh'],
  ['Riyadh, Riyadh Province, Saudi Arabia', 'SA', 'Riyadh'],
  ['Riyadh, Ar Riyāḍ, Saudi Arabia', 'SA', 'Riyadh'],
  ['الرياض', 'SA', 'Riyadh'],
  ['Jeddah, Makkah Province, Saudi Arabia', 'SA', 'Jeddah'],
  ['Jiddah', 'SA', 'Jeddah'],
  ['جدة', 'SA', 'Jeddah'],
  ['Dammam, Eastern Province, Saudi Arabia', 'SA', 'Dammam'],
  ['Al Khobar, Eastern Province, Saudi Arabia', 'SA', 'Al Khobar'],
  ['Al-Khobar', 'SA', 'Al Khobar'],
  ['Makkah, Makkah Province, Saudi Arabia', 'SA', 'Makkah'],
  ['Mecca, Saudi Arabia', 'SA', 'Makkah'],
  ['Madinah, Al Madinah Province, Saudi Arabia', 'SA', 'Madinah'],
  ['KSA', 'SA', null],
  ['SA', 'SA', null],
  ['SAU', 'SA', null],
  ['Kingdom of Saudi Arabia', 'SA', null],
  // Qatar, Kuwait, Bahrain, Oman
  ['Doha', 'QA', 'Doha'],
  ['QA - Doha, Qatar', 'QA', 'Doha'],
  ['الدوحة', 'QA', 'Doha'],
  ['Qatar', 'QA', null],
  ['QAT', 'QA', null],
  ['Kuwait City, Al Asimah Governate, Kuwait', 'KW', 'Kuwait City'],
  ['Kuwait City', 'KW', 'Kuwait City'],
  ['Kuwait', 'KW', null],
  ['الكويت', 'KW', null],
  ['Manama', 'BH', 'Manama'],
  ['Manama, Bahrain', 'BH', 'Manama'],
  ['المنامة', 'BH', 'Manama'],
  ['Bahrain, BH', 'BH', null],
  ['Muscat', 'OM', 'Muscat'],
  ['Muscat, Oman', 'OM', 'Muscat'],
  ['مسقط', 'OM', 'Muscat'],
  ['Oman', 'OM', null],
  ['OMN', 'OM', null],
]

describe('parseGccLocation', () => {
  it.each(CASES)('%s → %s / %s', (raw, code, city) => {
    const r = parseGccLocation(raw)
    expect(r).not.toBeNull()
    expect(r!.countryCode).toBe(code)
    expect(r!.city).toBe(city)
  })

  it('names the country', () => {
    expect(parseGccLocation('Dubai')!.country).toBe('United Arab Emirates')
    expect(parseGccLocation('Jeddah')!.country).toBe('Saudi Arabia')
    expect(parseGccLocation('Doha')!.country).toBe('Qatar')
  })

  it('repairs double-encoded Arabic', () => {
    expect(parseGccLocation(mojibake('دبي'))).toMatchObject({ countryCode: 'AE', city: 'Dubai' })
    expect(parseGccLocation(mojibake('الرياض'))).toMatchObject({ countryCode: 'SA', city: 'Riyadh' })
  })

  it('returns null outside the GCC and for empty input', () => {
    for (const raw of ['', null, undefined, 'Cairo, Egypt', 'Amman, Jordan', 'Bengaluru, India', 'Remote', 'London', 'Karachi, Pakistan']) {
      expect(parseGccLocation(raw)).toBeNull()
    }
  })

  it('does not read Indiana, South Africa or "Remote, IN" as the Gulf', () => {
    expect(parseGccLocation('Indianapolis, IN')).toBeNull()
    expect(parseGccLocation('Johannesburg, South Africa')).toBeNull()
  })

  it('takes the first GCC place in a multi-location string', () => {
    expect(parseGccLocation('Riyadh Saudi Arabia, Dubai United Arab Emirates')).toMatchObject({ countryCode: 'SA', city: 'Riyadh' })
  })
})

describe('scanPlaces — codes from ATS backends', () => {
  it.each([
    ['SA', 'SA'],
    ['ARE', 'AE'],
    ['SAU', 'SA'],
    ['QAT', 'QA'],
    ['KWT', 'KW'],
    ['BHR', 'BH'],
    ['OMN', 'OM'],
    ['Watsons Bahrain, BH', 'BH'],
    ['MBZ City, Abu Dhabi, United Arab Emirates', 'AE'],
    ['Riyadh, Ar Riyāḍ, Saudi Arabia', 'SA'],
  ])('%s → %s', (location, code) => {
    expect([...scanPlaces(location, { trustCodes: true }).regions]).toContain(code)
  })

  it('does not trust the new codes outside location fields', () => {
    expect(scanPlaces('SA and ARE').regions.size).toBe(0)
  })

  it('does not take South Africa\'s "SA" for Saudi Arabia', () => {
    expect(scanPlaces('Cape Town, SA', { trustCodes: true }).regions.has('SA')).toBe(false)
  })
})
