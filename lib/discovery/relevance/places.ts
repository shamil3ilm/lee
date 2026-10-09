import { resolveLocation } from '@/lib/regions/normalize'
import { allNodes, countriesOf, isWithin, shortName } from '@/lib/regions/tree'
import { US_CITIES, US_STATES } from '@/lib/regions/data-world'
import { normalizeForMatch, repairMojibake, termMatcher } from './text'

/**
 * Place lists for the relevance gate.
 *
 * TARGET regions (the GCC and India) come from the region taxonomy
 * (lib/regions): generous alias lists — cities, emirates, states, tech
 * parks, misspellings, Arabic — resolved by the one location normaliser,
 * because the gate must never drop a Gulf or Indian posting over a
 * spelling. FOREIGN places are only used to recognise "this posting is
 * somewhere else"; an unrecognised place is unknown (kept), never foreign.
 */

export const REGION_CODES = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'] as const
export type RegionCode = (typeof REGION_CODES)[number]

export const GCC_CODES: readonly RegionCode[] = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM']

export interface TargetRegion {
  code: RegionCode
  label: string
  aliases: readonly string[]
}

/** Every spelling of a place in `countryId`'s subtree (names, aliases, areas). */
function subtreeAliases(countryId: string): string[] {
  const out = new Set<string>()
  for (const n of allNodes()) {
    if (n.kind === 'remote' || !isWithin(n.id, countryId)) continue
    for (const a of [n.name.toLowerCase(), ...n.aliases]) out.add(a)
    for (const area of n.areas ?? []) for (const a of area.aliases) out.add(a)
  }
  return [...out]
}

/** Target regions, derived from the taxonomy so every spelling lives in one place. */
export const TARGET_REGIONS: readonly TargetRegion[] = REGION_CODES.map((code) => ({
  code,
  label: shortName(code.toLowerCase()),
  aliases: subtreeAliases(code.toLowerCase()),
}))

const REGION_BY_CODE = new Map(TARGET_REGIONS.map((r) => [r.code, r] as const))

export function regionLabel(code: RegionCode): string {
  return REGION_BY_CODE.get(code)?.label ?? code
}

export function isRegionCode(v: unknown): v is RegionCode {
  return typeof v === 'string' && (REGION_CODES as readonly string[]).includes(v)
}

/**
 * Broad areas that cover target regions. "EMEA" or "Middle East" includes
 * the Gulf; "APAC" includes India; a UTC+3…+5:30 window covers both.
 */
interface BroadArea {
  id: string
  covers: readonly RegionCode[]
  aliases: readonly string[]
}

const ALL: readonly RegionCode[] = REGION_CODES
const BROAD_AREAS: readonly BroadArea[] = [
  {
    id: 'WORLD',
    covers: ALL,
    aliases: [
      'worldwide', 'world wide', 'anywhere', 'anywhere in the world', 'global', 'globally',
      'work from anywhere', 'international', 'all countries', 'any location', 'any country',
    ],
  },
  { id: 'EMEA', covers: GCC_CODES, aliases: ['emea', 'europe middle east and africa', 'europe, middle east'] },
  {
    id: 'MIDDLE_EAST',
    covers: GCC_CODES,
    aliases: [
      'middle east', 'mena', 'menat', 'mea', 'gcc', 'gulf', 'gulf region', 'arabian gulf',
      'persian gulf', 'arab world', 'الخليج', 'الشرق الأوسط',
    ],
  },
  { id: 'APAC', covers: ['IN'], aliases: ['apac', 'asia pacific', 'asia-pacific', 'south asia', 'indian subcontinent'] },
  { id: 'ASIA', covers: ALL, aliases: ['asia', 'west asia'] },
]

/** Places that are not target regions. A match means "somewhere else". */
interface ForeignPlace {
  code: string
  label: string
  aliases: readonly string[]
}

const FOREIGN_PLACES: readonly ForeignPlace[] = [
  {
    code: 'US',
    label: 'US',
    aliases: [
      'united states', 'united states of america', 'usa', 'u.s.a', 'u.s', 'america',
      'us only', 'us-only', 'us based', 'us-based', 'continental us', 'contiguous us',
      ...US_STATES, ...US_CITIES,
    ],
  },
  { code: 'CA', label: 'Canada', aliases: ['canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary', 'ontario', 'british columbia', 'quebec', 'alberta'] },
  { code: 'NA', label: 'North America', aliases: ['north america', 'americas', 'the americas', 'us or canada', 'us/canada'] },
  { code: 'LATAM', label: 'LATAM', aliases: ['latam', 'latin america', 'south america', 'central america', 'mexico', 'mexico city', 'brazil', 'argentina', 'colombia', 'chile', 'peru', 'uruguay', 'costa rica', 'buenos aires', 'sao paulo', 'bogota', 'trinidad', 'port of spain'] },
  { code: 'GB', label: 'UK', aliases: ['united kingdom', 'u.k', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'london', 'greater london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'bristol', 'leeds', 'newcastle', 'bury st edmunds', 'cambridge, uk', 'oxford'] },
  { code: 'IE', label: 'Ireland', aliases: ['ireland', 'dublin', 'cork', 'galway'] },
  {
    code: 'EU',
    label: 'Europe',
    aliases: [
      'europe', 'european union', 'european time zones', 'cet', 'cest', 'germany', 'berlin',
      'munich', 'hamburg', 'frankfurt', 'france', 'paris', 'spain', 'madrid', 'barcelona',
      'portugal', 'lisbon', 'porto', 'italy', 'milan', 'rome', 'netherlands', 'amsterdam',
      'rotterdam', 'belgium', 'brussels', 'switzerland', 'zurich', 'geneva', 'austria',
      'vienna', 'poland', 'warsaw', 'krakow', 'sweden', 'stockholm', 'norway', 'oslo',
      'denmark', 'copenhagen', 'finland', 'helsinki', 'czech republic', 'czechia', 'prague',
      'romania', 'bucharest', 'bulgaria', 'sofia', 'hungary', 'budapest', 'greece', 'athens',
      'ukraine', 'kyiv', 'lithuania', 'vilnius', 'latvia', 'riga', 'estonia', 'tallinn',
      'serbia', 'belgrade', 'croatia', 'zagreb', 'slovakia', 'slovenia', 'luxembourg', 'malta',
      'cyprus',
    ],
  },
  { code: 'AU', label: 'Australia/NZ', aliases: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'queensland', 'new south wales', 'sunshine coast', 'alice springs', 'new zealand', 'auckland', 'wellington'] },
  {
    code: 'ASIA_OTHER',
    label: 'another Asian country',
    aliases: [
      'singapore', 'malaysia', 'kuala lumpur', 'indonesia', 'jakarta', 'philippines', 'manila',
      'vietnam', 'ho chi minh', 'hanoi', 'thailand', 'bangkok', 'japan', 'tokyo', 'osaka',
      'korea', 'south korea', 'seoul', 'china', 'shanghai', 'beijing', 'shenzhen', 'hong kong',
      'taiwan', 'taipei', 'pakistan', 'karachi', 'lahore', 'islamabad', 'bangladesh', 'dhaka',
      'sri lanka', 'colombo', 'nepal', 'kathmandu', 'kyrgyzstan', 'bishkek', 'kazakhstan',
      'almaty', 'uzbekistan', 'tashkent',
    ],
  },
  {
    code: 'MEA_OTHER',
    label: 'another MEA country',
    aliases: [
      'israel', 'tel aviv', 'turkey', 'turkiye', 'istanbul', 'ankara', 'egypt', 'cairo',
      'jordan', 'amman', 'lebanon', 'beirut', 'morocco', 'casablanca', 'tunisia', 'nigeria',
      'lagos', 'kenya', 'nairobi', 'south africa', 'cape town', 'johannesburg', 'ghana',
      'ethiopia', 'iraq', 'iran', 'tehran',
    ],
  },
]

/**
 * Upper-case foreign tokens only trusted in a location field, matched
 * case-sensitively. Target-region codes (UAE, KSA, ARE, SA…) are read by the
 * region normaliser.
 */
const FOREIGN_CODES: ReadonlyArray<{ re: RegExp; foreign: string }> = [
  { re: /(?<![A-Za-z])(?:US|USA|U\.S\.A?\.?)(?![A-Za-z])/, foreign: 'US' },
  { re: /(?<![A-Za-z])UK(?![A-Za-z])/, foreign: 'GB' },
  { re: /(?<![A-Za-z])EU(?![A-Za-z])/, foreign: 'EU' },
  { re: /(?<![A-Za-z])(?:EST|PST|CST|MST|EDT|PDT|ET|PT)(?![A-Za-z])/, foreign: 'US' },
]

/** UTC/GMT offsets from +3 to +5:30 sit on Gulf and Indian working hours. */
export const GULF_INDIA_TZ = /(?:utc|gmt)\s*\+\s*0?(?:3|4|5)(?::?(?:00|30))?(?![\d])|\b(?:gst|gulf standard time|ist|india standard time)\b/

const BROAD_MATCHERS = BROAD_AREAS.map((b) => ({ ...b, match: termMatcher(b.aliases) }))
const FOREIGN_MATCHERS = FOREIGN_PLACES.map((f) => ({ code: f.code, label: f.label, match: termMatcher(f.aliases) }))

const FOREIGN_LABEL = new Map(FOREIGN_PLACES.map((f) => [f.code, f.label] as const))

/** Group codes whose label is vague; the matched place name reads better. */
const GROUP_CODES = new Set(['EU', 'AU', 'LATAM', 'ASIA_OTHER', 'MEA_OTHER'])

function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

/** Reason label for a foreign code: "US", "UK", or the place as written ("Germany"). */
export function foreignLabel(code: string, matched?: string): string {
  if (matched && GROUP_CODES.has(code)) return titleCase(matched)
  return FOREIGN_LABEL.get(code) ?? code
}

export interface PlaceScan {
  /** Target regions named explicitly (a city, country or alias). */
  regions: Set<RegionCode>
  /** Target regions covered by a broad area ("EMEA", "APAC", a UTC+4 window). */
  covered: Set<RegionCode>
  /** "Worldwide", "anywhere"… */
  worldwide: boolean
  /** Foreign place codes (US, GB, EU…). */
  foreign: Set<string>
  /** The text that matched each foreign code (normalized), for reasons. */
  foreignNames: Map<string, string>
  /** Deepest region-taxonomy nodes named (lib/regions), e.g. "kochi", "dubai", "de". */
  nodes: Set<string>
}

export function emptyScan(): PlaceScan {
  return { regions: new Set(), covered: new Set(), worldwide: false, foreign: new Set(), foreignNames: new Map(), nodes: new Set() }
}

/** Taxonomy places → the target-region codes they lie in. */
function addResolved(raw: string, trustCodes: boolean, scan: PlaceScan): void {
  for (const place of resolveLocation(raw, { trustCodes }).places) {
    scan.nodes.add(place.id)
    for (const c of countriesOf(place.id)) {
      const code = c.toUpperCase()
      if (isRegionCode(code)) scan.regions.add(code)
    }
  }
}

/**
 * Scan free text (a location field, a title, a remote-eligibility phrase)
 * for places. `raw` is the original text; codes such as "UAE" or "US" are
 * only trusted when `trustCodes` is set (location fields), since "us" is an
 * ordinary word in a description.
 */
export function scanPlaces(raw: string | null | undefined, opts: { trustCodes?: boolean } = {}): PlaceScan {
  const scan = emptyScan()
  if (!raw) return scan
  const text = normalizeForMatch(raw)
  addResolved(raw, opts.trustCodes === true, scan)
  for (const b of BROAD_MATCHERS) {
    if (!b.match(text)) continue
    if (b.id === 'WORLD') scan.worldwide = true
    for (const c of b.covers) scan.covered.add(c)
  }
  if (GULF_INDIA_TZ.test(text)) for (const c of ALL) scan.covered.add(c)
  for (const f of FOREIGN_MATCHERS) {
    const hit = f.match(text)
    if (!hit) continue
    scan.foreign.add(f.code)
    scan.foreignNames.set(f.code, hit)
  }
  if (opts.trustCodes) addForeignCodes(repairMojibake(raw), scan)
  // "America" inside "Latin America"/"North America" is not the US.
  if (scan.foreign.has('US') && (scan.foreign.has('LATAM') || scan.foreign.has('NA'))) {
    if (!/\b(?:united states|usa|u\.s)\b/.test(text)) scan.foreign.delete('US')
  }
  return scan
}

function addForeignCodes(raw: string, scan: PlaceScan): void {
  for (const c of FOREIGN_CODES) if (c.re.test(raw)) scan.foreign.add(c.foreign)
}

export function mergeScans(a: PlaceScan, b: PlaceScan): PlaceScan {
  return {
    regions: new Set([...a.regions, ...b.regions]),
    covered: new Set([...a.covered, ...b.covered]),
    worldwide: a.worldwide || b.worldwide,
    foreign: new Set([...a.foreign, ...b.foreign]),
    foreignNames: new Map([...b.foreignNames, ...a.foreignNames]),
    nodes: new Set([...a.nodes, ...b.nodes]),
  }
}

/** True when the scan names nothing at all. */
export function isEmptyScan(s: PlaceScan): boolean {
  return s.regions.size === 0 && s.covered.size === 0 && !s.worldwide && s.foreign.size === 0 && s.nodes.size === 0
}
