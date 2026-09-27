import { normalizeForMatch, repairMojibake, termMatcher, type TermMatcher } from './text'

/**
 * Maintained place lists for the relevance gate.
 *
 * TARGET regions (the GCC and India) carry generous alias lists — cities,
 * emirates, states, tech parks, common misspellings, Arabic names — because
 * the gate must never drop a Gulf or Indian posting over a spelling. FOREIGN
 * places are only used to recognise "this posting is somewhere else"; an
 * unrecognised place is treated as unknown (kept), never as foreign.
 */

export const REGION_CODES = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'] as const
export type RegionCode = (typeof REGION_CODES)[number]

export const GCC_CODES: readonly RegionCode[] = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM']

export interface TargetRegion {
  code: RegionCode
  label: string
  aliases: readonly string[]
}

export const TARGET_REGIONS: readonly TargetRegion[] = [
  {
    code: 'AE',
    label: 'UAE',
    aliases: [
      'uae', 'u.a.e', 'united arab emirates', 'the emirates', 'emirates',
      'dubai', 'dubayy', 'dxb', 'abu dhabi', 'abudhabi', 'abu-dhabi', 'sharjah', 'ajman',
      'ras al khaimah', 'ras al-khaimah', 'rak', 'fujairah', 'umm al quwain', 'al ain',
      'jebel ali', 'difc', 'dmcc', 'dubai internet city', 'dubai silicon oasis', 'jlt',
      'masdar', 'khalifa city', 'mussafah', 'business bay', 'dubai media city',
      'دبي', 'أبوظبي', 'أبو ظبي', 'ابوظبي', 'الشارقة', 'عجمان', 'الإمارات', 'الامارات',
      'الإمارات العربية المتحدة', 'العين', 'رأس الخيمة', 'الفجيرة', 'أم القيوين',
    ],
  },
  {
    code: 'SA',
    label: 'Saudi Arabia',
    aliases: [
      'saudi arabia', 'saudi', 'ksa', 'k.s.a', 'kingdom of saudi arabia', 'saudia',
      'riyadh', 'riyad', 'ar riyad', 'jeddah', 'jiddah', 'jedda', 'dammam', 'khobar',
      'al khobar', 'al-khobar', 'alkhobar', 'dhahran', 'mecca', 'makkah', 'medina',
      'madinah', 'al madinah', 'neom', 'jubail', 'al jubail', 'yanbu', 'tabuk', 'abha',
      'qassim', 'buraidah', 'taif', 'kaec', 'king abdullah economic city', 'eastern province',
      'السعودية', 'المملكة العربية السعودية', 'الرياض', 'جدة', 'الدمام', 'الخبر',
      'الظهران', 'مكة', 'المدينة المنورة', 'نيوم', 'الجبيل', 'ينبع', 'تبوك',
    ],
  },
  {
    code: 'QA',
    label: 'Qatar',
    aliases: [
      'qatar', 'doha', 'lusail', 'al wakrah', 'al rayyan', 'ras laffan', 'mesaieed',
      'قطر', 'الدوحة', 'لوسيل', 'الريان',
    ],
  },
  {
    code: 'KW',
    label: 'Kuwait',
    aliases: [
      'kuwait', 'kuwait city', 'al kuwait', 'salmiya', 'hawalli', 'farwaniya', 'ahmadi',
      'jahra', 'shuwaikh', 'الكويت', 'مدينة الكويت',
    ],
  },
  {
    code: 'BH',
    label: 'Bahrain',
    aliases: [
      'bahrain', 'kingdom of bahrain', 'manama', 'muharraq', 'riffa', 'isa town', 'seef',
      'sitra', 'البحرين', 'المنامة', 'المحرق',
    ],
  },
  {
    code: 'OM',
    label: 'Oman',
    aliases: [
      'oman', 'sultanate of oman', 'muscat', 'masqat', 'salalah', 'sohar', 'nizwa', 'duqm',
      'seeb', 'عمان', 'عُمان', 'سلطنة عمان', 'مسقط', 'صلالة', 'صحار',
    ],
  },
  {
    code: 'IN',
    label: 'India',
    aliases: [
      'india', 'bharat', 'pan india', 'pan-india', 'anywhere in india', 'remote india',
      'bengaluru', 'bangalore', 'banglore', 'bengalore', 'kochi', 'cochin', 'ernakulam',
      'kakkanad', 'infopark', 'kerala', 'trivandrum', 'thiruvananthapuram', 'technopark',
      'kozhikode', 'calicut', 'thrissur', 'kannur', 'kollam', 'palakkad', 'hyderabad',
      'secunderabad', 'hitec city', 'gachibowli', 'chennai', 'madras', 'pune', 'poona',
      'hinjewadi', 'mumbai', 'bombay', 'navi mumbai', 'thane', 'gurgaon', 'gurugram',
      'noida', 'greater noida', 'delhi', 'new delhi', 'ncr', 'delhi ncr', 'faridabad',
      'ghaziabad', 'kolkata', 'calcutta', 'ahmedabad', 'gandhinagar', 'gift city',
      'jaipur', 'chandigarh', 'mohali', 'panchkula', 'indore', 'bhopal', 'coimbatore',
      'mysore', 'mysuru', 'mangalore', 'mangaluru', 'hubli', 'visakhapatnam', 'vizag',
      'vijayawada', 'bhubaneswar', 'nagpur', 'nashik', 'aurangabad', 'lucknow', 'kanpur',
      'vadodara', 'baroda', 'surat', 'rajkot', 'trichy', 'tiruchirappalli', 'madurai',
      'goa', 'dehradun', 'agra', 'patna', 'ranchi', 'raipur', 'guwahati', 'ludhiana',
      'amritsar', 'jodhpur', 'udaipur', 'varanasi', 'prayagraj', 'meerut', 'karnataka',
      'tamil nadu', 'telangana', 'maharashtra', 'haryana', 'uttar pradesh', 'gujarat',
      'west bengal', 'andhra pradesh', 'odisha', 'madhya pradesh', 'rajasthan', 'punjab',
      'uttarakhand',
    ],
  },
]

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

const US_STATES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
  'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
  'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas',
  'utah', 'vermont', 'virginia', 'washington state', 'west virginia', 'wisconsin', 'wyoming',
]
const US_CITIES = [
  'new york', 'new york city', 'nyc', 'manhattan', 'brooklyn', 'san francisco', 'sf bay area',
  'bay area', 'los angeles', 'seattle', 'austin', 'boston', 'chicago', 'denver', 'atlanta',
  'dallas', 'houston', 'miami', 'san diego', 'san jose', 'palo alto', 'mountain view',
  'redwood city', 'menlo park', 'sunnyvale', 'santa clara', 'cupertino', 'oakland',
  'cincinnati', 'wichita', 'portland', 'philadelphia', 'washington dc', 'washington, dc',
  'pittsburgh', 'detroit', 'minneapolis', 'phoenix', 'salt lake city', 'raleigh', 'nashville',
  'charlotte', 'columbus', 'indianapolis', 'st. louis', 'kansas city', 'baltimore', 'tampa',
  'orlando', 'las vegas', 'sacramento', 'irvine', 'boulder', 'cambridge, ma',
]

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

/** Upper-case tokens only trusted in a location field, matched case-sensitively. */
const LOCATION_CODES: ReadonlyArray<{ re: RegExp; region?: RegionCode; foreign?: string }> = [
  { re: /(?<![A-Za-z])(?:UAE|U\.A\.E\.?|AE)(?![A-Za-z])/, region: 'AE' },
  { re: /(?<![A-Za-z])KSA(?![A-Za-z])/, region: 'SA' },
  { re: /(?<![A-Za-z])(?:QA|KW|BH|OM)(?![A-Za-z])/ },
  { re: /(?<![A-Za-z])(?:US|USA|U\.S\.A?\.?)(?![A-Za-z])/, foreign: 'US' },
  { re: /(?<![A-Za-z])UK(?![A-Za-z])/, foreign: 'GB' },
  { re: /(?<![A-Za-z])EU(?![A-Za-z])/, foreign: 'EU' },
  { re: /(?<![A-Za-z])(?:EST|PST|CST|MST|EDT|PDT|ET|PT)(?![A-Za-z])/, foreign: 'US' },
]
const GULF_CODE_TOKEN: Readonly<Record<string, RegionCode>> = { QA: 'QA', KW: 'KW', BH: 'BH', OM: 'OM' }

/** UTC/GMT offsets from +3 to +5:30 sit on Gulf and Indian working hours. */
const GULF_INDIA_TZ = /(?:utc|gmt)\s*\+\s*0?(?:3|4|5)(?::?(?:00|30))?(?![\d])|\b(?:gst|gulf standard time|ist|india standard time)\b/

const TARGET_MATCHERS: ReadonlyArray<{ code: RegionCode; match: TermMatcher }> = TARGET_REGIONS.map((r) => ({
  code: r.code,
  match: termMatcher(r.aliases),
}))
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
}

export function emptyScan(): PlaceScan {
  return { regions: new Set(), covered: new Set(), worldwide: false, foreign: new Set(), foreignNames: new Map() }
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
  for (const t of TARGET_MATCHERS) if (t.match(text)) scan.regions.add(t.code)
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
  if (opts.trustCodes) addLocationCodes(repairMojibake(raw), scan)
  // "America" inside "Latin America"/"North America" is not the US.
  if (scan.foreign.has('US') && (scan.foreign.has('LATAM') || scan.foreign.has('NA'))) {
    if (!/\b(?:united states|usa|u\.s)\b/.test(text)) scan.foreign.delete('US')
  }
  return scan
}

function addLocationCodes(raw: string, scan: PlaceScan): void {
  for (const c of LOCATION_CODES) {
    const m = c.re.exec(raw)
    if (!m) continue
    if (c.region) scan.regions.add(c.region)
    else if (c.foreign) scan.foreign.add(c.foreign)
    else {
      const code = GULF_CODE_TOKEN[m[0]]
      if (code) scan.regions.add(code)
    }
  }
}

export function mergeScans(a: PlaceScan, b: PlaceScan): PlaceScan {
  return {
    regions: new Set([...a.regions, ...b.regions]),
    covered: new Set([...a.covered, ...b.covered]),
    worldwide: a.worldwide || b.worldwide,
    foreign: new Set([...a.foreign, ...b.foreign]),
    foreignNames: new Map([...b.foreignNames, ...a.foreignNames]),
  }
}

/** True when the scan names nothing at all. */
export function isEmptyScan(s: PlaceScan): boolean {
  return s.regions.size === 0 && s.covered.size === 0 && !s.worldwide && s.foreign.size === 0
}
