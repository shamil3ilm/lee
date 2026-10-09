import { describe, expect, it } from 'vitest'
import { resolveLocation } from '@/lib/regions/normalize'
import { sharedAliasKeys } from '@/lib/regions/matcher'

/**
 * The region normaliser on location strings as boards write them: every
 * alias the taxonomy lists, Arabic, IT parks, free zones, multi-location
 * postings, ambiguous names, ISO codes and junk. Expected = the DEEPEST
 * nodes, in the order the text names them.
 */
const mojibake = (s: string): string => String.fromCharCode(...new TextEncoder().encode(s))

const ids = (raw: string, trustCodes = true): string[] => resolveLocation(raw, { trustCodes }).places.map((p) => p.id)

type Case = readonly [string, readonly string[]]

const GCC: readonly Case[] = [
  ['Dubai', ['dubai']],
  ['Dubai - UAE', ['dubai']],
  ['AE - Dubai, United Arab Emirates', ['dubai']],
  ['Dubai, AE', ['dubai']],
  ['Dubai, Dubai, United Arab Emirates', ['dubai']],
  ['UAE', ['ae']],
  ['U.A.E.', ['ae']],
  ['ARE', ['ae']],
  ['United Arab Emirates', ['ae']],
  ['دبي', ['dubai']],
  ['دبي، الإمارات العربية المتحدة', ['dubai']],
  ['AbuDhabi', ['abu-dhabi']],
  ['Abu-Dhabi, UAE', ['abu-dhabi']],
  ['أبوظبي', ['abu-dhabi']],
  ['أبو ظبي', ['abu-dhabi']],
  ['Al Ain, Abu Dhabi, AE', ['al-ain']],
  ['Sharjah', ['sharjah']],
  ['الشارقة', ['sharjah']],
  ['Ajman, UAE', ['ajman']],
  ['Ras Al Khaimah', ['ras-al-khaimah']],
  ['Fujairah', ['fujairah']],
  ['Umm Al Quwain', ['umm-al-quwain']],
  ['Riyadh', ['riyadh']],
  ['Riyadh, SA', ['riyadh']],
  ['Riyadh, KSA', ['riyadh']],
  ['Riyadh, Riyadh Province, Saudi Arabia', ['riyadh']],
  ['Riyadh, Ar Riyāḍ, Saudi Arabia', ['riyadh']],
  ['الرياض', ['riyadh']],
  ['Jeddah, Makkah Province, Saudi Arabia', ['jeddah']],
  ['Jiddah', ['jeddah']],
  ['جدة', ['jeddah']],
  ['Dammam, Eastern Province, Saudi Arabia', ['dammam']],
  ['Al-Khobar', ['al-khobar']],
  ['Dhahran', ['dhahran']],
  ['Eastern Province, Saudi Arabia', ['eastern-province']],
  ['Mecca, Saudi Arabia', ['makkah']],
  ['Madinah, Al Madinah Province, Saudi Arabia', ['madinah']],
  ['NEOM', ['neom']],
  ['Tabuk, Saudi Arabia', ['tabuk']],
  ['KSA', ['sa']],
  ['SAU', ['sa']],
  ['Kingdom of Saudi Arabia', ['sa']],
  ['Doha', ['doha']],
  ['QA - Doha, Qatar', ['doha']],
  ['الدوحة', ['doha']],
  ['Lusail', ['lusail']],
  ['Kuwait City, Al Asimah Governate, Kuwait', ['kuwait-city']],
  ['Kuwait', ['kw']],
  ['الكويت', ['kw']],
  ['Manama, Bahrain', ['manama']],
  ['المنامة', ['manama']],
  ['Bahrain, BH', ['bh']],
  ['Muscat, Oman', ['muscat']],
  ['مسقط', ['muscat']],
  ['Sohar', ['sohar']],
  ['OMN', ['om']],
  ['GCC', ['gcc']],
  ['Gulf Cooperation Council', ['gcc']],
]

const FREE_ZONES: ReadonlyArray<readonly [string, string, string]> = [
  ['DIFC, Dubai', 'dubai', 'DIFC'],
  ['Dubai Internet City', 'dubai', 'Dubai Internet City'],
  ['Dubai Silicon Oasis, Dubai, UAE', 'dubai', 'Dubai Silicon Oasis'],
  ['JLT, Dubai', 'dubai', 'JLT'],
  ['Business Bay, Dubai', 'dubai', 'Business Bay'],
  ['Jebel Ali Free Zone', 'dubai', 'Jebel Ali'],
  ['ADGM, Abu Dhabi', 'abu-dhabi', 'ADGM'],
  ['Masdar City', 'abu-dhabi', 'Masdar City'],
  ['MBZ City, Abu Dhabi, United Arab Emirates', 'abu-dhabi', 'MBZ City'],
  ['KAFD, Riyadh', 'riyadh', 'KAFD'],
  ['Infopark, Kochi', 'kochi', 'Infopark'],
  ['Infopark Kakkanad', 'kochi', 'Infopark'],
  ['SmartCity Kochi', 'kochi', 'SmartCity Kochi'],
  ['Technopark, Trivandrum', 'thiruvananthapuram', 'Technopark'],
  ['Technopark Phase III, Thiruvananthapuram', 'thiruvananthapuram', 'Technopark'],
  ['UL Cyberpark, Calicut', 'kozhikode', 'UL Cyberpark'],
  ['Govt Cyberpark, Kozhikode', 'kozhikode', 'Cyberpark'],
  ['Electronic City, Bangalore', 'bengaluru', 'Electronic City'],
  ['Whitefield, Bengaluru', 'bengaluru', 'Whitefield'],
  ['Outer Ring Road, Bangalore', 'bengaluru', 'Outer Ring Road'],
  ['HITEC City, Hyderabad', 'hyderabad', 'HITEC City'],
  ['Gachibowli', 'hyderabad', 'Gachibowli'],
  ['Hinjewadi, Pune', 'pune', 'Hinjewadi'],
  ['Navi Mumbai', 'mumbai', 'Navi Mumbai'],
  ['Thane, Maharashtra', 'mumbai', 'Thane'],
]

const INDIA: readonly Case[] = [
  ['Kochi', ['kochi']],
  ['Cochin', ['kochi']],
  ['Ernakulam', ['kochi']],
  ['Kakkanad, Kerala', ['kochi']],
  ['Kochi, Kerala, India', ['kochi']],
  ['Thiruvananthapuram, Kerala, India', ['thiruvananthapuram']],
  ['Trivandrum', ['thiruvananthapuram']],
  ['TVM', ['thiruvananthapuram']],
  ['Kozhikode', ['kozhikode']],
  ['Calicut', ['kozhikode']],
  ['Thrissur', ['thrissur']],
  ['Kannur', ['kannur']],
  ['Kollam', ['kollam']],
  ['Kerala', ['kerala']],
  ['Kerala, India', ['kerala']],
  ['Bengaluru', ['bengaluru']],
  ['Bangalore', ['bengaluru']],
  ['BLR', ['bengaluru']],
  ['Bengaluru, Karnataka, India', ['bengaluru']],
  ['Hyderabad', ['hyderabad']],
  ['HYD', ['hyderabad']],
  ['Hyderabad, Telangana, India', ['hyderabad']],
  ['Chennai', ['chennai']],
  ['Madras', ['chennai']],
  ['Pune', ['pune']],
  ['Mumbai', ['mumbai']],
  ['Bombay', ['mumbai']],
  ['Noida', ['noida']],
  ['Gurgaon', ['gurugram']],
  ['Gurugram, Haryana', ['gurugram']],
  ['New Delhi', ['delhi']],
  ['Delhi NCR', ['delhi-ncr']],
  ['Kolkata', ['kolkata']],
  ['Calcutta', ['kolkata']],
  ['Ahmedabad', ['ahmedabad']],
  ['Coimbatore', ['coimbatore']],
  ['Mysore', ['mysuru']],
  ['Mangalore', ['mangaluru']],
  ['Vizag', ['visakhapatnam']],
  ['India', ['in']],
  ['Pan India', ['in']],
  ['Remote (India)', ['in']],
  ['IND', ['in']],
  ['Karnataka, India', ['karnataka']],
]

const MULTI: readonly Case[] = [
  ['Bangalore / Hyderabad / Remote', ['bengaluru', 'hyderabad']],
  ['Dubai or Abu Dhabi', ['dubai', 'abu-dhabi']],
  ['Kochi | Trivandrum', ['kochi', 'thiruvananthapuram']],
  ['Bengaluru; Chennai; Pune', ['bengaluru', 'chennai', 'pune']],
  ['Riyadh Saudi Arabia, Dubai United Arab Emirates', ['riyadh', 'dubai']],
  ['Hyderabad / Dubai, UAE', ['hyderabad', 'dubai']],
  ['Kochi, Kerala and Bengaluru, Karnataka', ['kochi', 'bengaluru']],
]

const AMBIGUOUS: readonly Case[] = [
  ['Kochi, Japan', ['jp']],
  ['Hyderabad, Sindh, Pakistan', ['pk']],
  ['Medina, Ohio', ['us']],
  ['Lahore, Punjab, Pakistan', ['pk']],
  ['Mecca, California, United States', ['us']],
]

const CODES_AND_FOREIGN: readonly Case[] = [
  ['Dubai, ARE', ['dubai']],
  ['Riyadh, SAU', ['riyadh']],
  ['SA', ['sa']],
  ['Cape Town, SA', []],
  ['Indianapolis, IN', ['us']],
  ['Indiana', ['us']],
  ['Berlin, DE', ['de']],
  ['London, UK', ['gb']],
  ['Remote - US', ['us']],
  ['Amsterdam, Netherlands', ['nl']],
  ['Toronto, Canada', ['ca']],
]

const JUNK: readonly string[] = ['', '   ', 'Remote', 'Anywhere', 'TBD', 'N/A', '12345', 'Join us for coffee', 'Hybrid', 'On-site', 'Multiple locations']

describe('resolveLocation — GCC', () => {
  it.each(GCC)('%s → %j', (raw, expected) => expect(ids(raw)).toEqual(expected))

  it('repairs double-encoded Arabic', () => {
    expect(ids(mojibake('دبي'))).toEqual(['dubai'])
    expect(ids(mojibake('الرياض'))).toEqual(['riyadh'])
  })
})

describe('resolveLocation — free zones and IT parks', () => {
  it.each(FREE_ZONES)('%s → %s (%s)', (raw, id, area) => {
    expect(resolveLocation(raw, { trustCodes: true }).places).toEqual([{ id, area }])
  })
})

describe('resolveLocation — India', () => {
  it.each(INDIA)('%s → %j', (raw, expected) => expect(ids(raw)).toEqual(expected))
})

describe('resolveLocation — multi-location postings', () => {
  it.each(MULTI)('%s → %j', (raw, expected) => expect(ids(raw)).toEqual(expected))
})

describe('resolveLocation — ambiguous names prefer the country context', () => {
  it.each(AMBIGUOUS)('%s → %j', (raw, expected) => expect(ids(raw)).toEqual(expected))
})

describe('resolveLocation — ISO codes and other countries', () => {
  it.each(CODES_AND_FOREIGN)('%s → %j', (raw, expected) => expect(ids(raw)).toEqual(expected))

  it('trusts upper-case codes only in a location field', () => {
    expect(ids('ARE', false)).toEqual([])
    expect(ids('SA', false)).toEqual([])
    expect(ids('Riyadh, SA', false)).toEqual(['riyadh'])
  })
})

describe('resolveLocation — junk', () => {
  it.each(JUNK)('%j → nothing', (raw) => expect(ids(raw)).toEqual([]))

  it('handles null and undefined', () => {
    expect(resolveLocation(null).places).toEqual([])
    expect(resolveLocation(undefined).ids).toEqual([])
  })
})

describe('resolveLocation — ancestors', () => {
  it('stores each place with every ancestor', () => {
    expect(resolveLocation('Infopark, Kochi').ids).toEqual(expect.arrayContaining(['kochi', 'kerala', 'in']))
    expect(resolveLocation('Gurgaon').ids).toEqual(expect.arrayContaining(['gurugram', 'delhi-ncr', 'haryana', 'in']))
    expect(resolveLocation('Al Ain').ids).toEqual(expect.arrayContaining(['al-ain', 'abu-dhabi', 'ae', 'gcc']))
    expect(resolveLocation('Dubai').ids).not.toContain('in')
  })

  it('no alias key names two different places', () => {
    expect(sharedAliasKeys()).toEqual([])
  })
})
