import { node, type RegionNode } from './types'

/**
 * Remote scopes and the countries outside the target regions that
 * relocation and "other countries" preferences use, at country level (with
 * their main cities as aliases, so "Kochi, Japan" or "Berlin" resolve to a
 * country and never to an Indian city).
 */

export const US_STATES: readonly string[] = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
  'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
  'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas',
  'utah', 'vermont', 'virginia', 'washington state', 'west virginia', 'wisconsin', 'wyoming',
]

export const US_CITIES: readonly string[] = [
  'new york', 'new york city', 'nyc', 'manhattan', 'brooklyn', 'san francisco', 'sf bay area',
  'bay area', 'los angeles', 'seattle', 'austin', 'boston', 'chicago', 'denver', 'atlanta',
  'dallas', 'houston', 'miami', 'san diego', 'san jose', 'palo alto', 'mountain view',
  'redwood city', 'menlo park', 'sunnyvale', 'santa clara', 'cupertino', 'oakland',
  'cincinnati', 'wichita', 'portland', 'philadelphia', 'washington dc', 'washington, dc',
  'pittsburgh', 'detroit', 'minneapolis', 'phoenix', 'salt lake city', 'raleigh', 'nashville',
  'charlotte', 'columbus', 'indianapolis', 'st. louis', 'kansas city', 'baltimore', 'tampa',
  'orlando', 'las vegas', 'sacramento', 'irvine', 'boulder', 'cambridge, ma',
]

const REMOTE: readonly RegionNode[] = [
  node({ id: 'remote', name: 'Remote', kind: 'remote' }),
  node({ id: 'remote-worldwide', name: 'Remote worldwide', short: 'Worldwide', kind: 'remote', parents: ['remote'] }),
  node({ id: 'remote-apac', name: 'Remote APAC', short: 'APAC', kind: 'remote', parents: ['remote'] }),
  node({ id: 'remote-emea', name: 'Remote EMEA', short: 'EMEA', kind: 'remote', parents: ['remote'] }),
  node({ id: 'remote-india-tz', name: 'Remote, India-friendly hours', short: 'India-friendly hours', kind: 'remote', parents: ['remote'] }),
]

const country = (
  id: string,
  name: string,
  aliases: readonly string[],
  extra: { short?: string; codes?: readonly string[]; parents?: readonly string[] } = {},
): RegionNode => node({ id, name, kind: 'country', aliases, ...extra })

const EUROPE: readonly RegionNode[] = [
  node({ id: 'europe', name: 'Europe', kind: 'group', aliases: ['european union'] }),
  country('gb', 'United Kingdom', [
    'u.k', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'london', 'greater london',
    'manchester', 'birmingham', 'edinburgh', 'glasgow', 'bristol', 'leeds', 'cambridge, uk', 'oxford',
  ], { short: 'UK', codes: ['UK', 'GB', 'GBR'], parents: ['europe'] }),
  country('ie', 'Ireland', ['dublin', 'cork', 'galway'], { codes: ['IE', 'IRL'], parents: ['europe'] }),
  country('de', 'Germany', ['deutschland', 'berlin', 'munich', 'münchen', 'hamburg', 'frankfurt', 'cologne', 'stuttgart', 'düsseldorf'], { codes: ['DE', 'DEU'], parents: ['europe'] }),
  country('nl', 'Netherlands', ['the netherlands', 'holland', 'amsterdam', 'rotterdam', 'the hague', 'utrecht', 'eindhoven'], { codes: ['NL', 'NLD'], parents: ['europe'] }),
  country('fr', 'France', ['paris', 'lyon'], { codes: ['FR', 'FRA'], parents: ['europe'] }),
  country('es', 'Spain', ['madrid', 'barcelona'], { codes: ['ESP'], parents: ['europe'] }),
  country('pt', 'Portugal', ['lisbon', 'porto'], { codes: ['PRT'], parents: ['europe'] }),
  country('it', 'Italy', ['milan', 'rome'], { codes: ['ITA'], parents: ['europe'] }),
  country('be', 'Belgium', ['brussels'], { codes: ['BEL'], parents: ['europe'] }),
  country('ch', 'Switzerland', ['zurich', 'zürich', 'geneva', 'basel', 'bern', 'lausanne'], { codes: ['CHE'], parents: ['europe'] }),
  country('at', 'Austria', ['vienna', 'wien'], { codes: ['AUT'], parents: ['europe'] }),
  country('pl', 'Poland', ['warsaw', 'krakow'], { codes: ['POL'], parents: ['europe'] }),
  country('se', 'Sweden', ['stockholm'], { codes: ['SWE'], parents: ['europe'] }),
  country('no', 'Norway', ['oslo'], { codes: ['NOR'], parents: ['europe'] }),
  country('dk', 'Denmark', ['copenhagen'], { codes: ['DNK'], parents: ['europe'] }),
  country('fi', 'Finland', ['helsinki'], { codes: ['FIN'], parents: ['europe'] }),
]

const AMERICAS_APAC_MEA: readonly RegionNode[] = [
  country('us', 'United States', [
    'united states of america', 'usa', 'u.s.a', 'us only', 'us-only', 'us based', 'us-based', ...US_STATES, ...US_CITIES,
  ], { short: 'US', codes: ['US', 'USA'] }),
  country('ca', 'Canada', ['toronto', 'vancouver', 'montreal', 'ottawa', 'calgary', 'ontario', 'british columbia', 'quebec', 'alberta'], { codes: ['CAN'] }),
  country('au', 'Australia', ['sydney', 'melbourne', 'brisbane', 'adelaide', 'queensland', 'new south wales'], { codes: ['AU', 'AUS'] }),
  country('nz', 'New Zealand', ['auckland', 'wellington'], { codes: ['NZ', 'NZL'] }),
  country('sg', 'Singapore', [], { codes: ['SG', 'SGP'] }),
  country('my', 'Malaysia', ['kuala lumpur'], { codes: ['MYS'] }),
  country('jp', 'Japan', ['tokyo', 'osaka', 'kyoto', 'kochi prefecture', 'kochi-shi'], { codes: ['JP', 'JPN'] }),
  country('pk', 'Pakistan', ['karachi', 'lahore', 'islamabad', 'sindh'], { codes: ['PAK'] }),
  country('lk', 'Sri Lanka', ['colombo'], { codes: ['LKA'] }),
  country('bd', 'Bangladesh', ['dhaka'], { codes: ['BGD'] }),
  country('np', 'Nepal', ['kathmandu'], { codes: ['NPL'] }),
  country('eg', 'Egypt', ['cairo'], { codes: ['EGY'] }),
  country('jo', 'Jordan', ['amman'], { codes: ['JOR'] }),
  country('tr', 'Turkey', ['turkiye', 'türkiye', 'istanbul', 'ankara'], { codes: ['TUR'] }),
]

export const WORLD_NODES: readonly RegionNode[] = [...REMOTE, ...EUROPE, ...AMERICAS_APAC_MEA]
