import { GCC_CODES, scanPlaces, TARGET_REGIONS, type RegionCode } from './places'
import { normalizeForMatch, repairMojibake, termMatcher, type TermMatcher } from './text'

/**
 * GCC location normaliser: one canonical { country, city } for the many
 * ways boards write a Gulf place — "AE - Dubai, United Arab Emirates"
 * (Workday), "Riyadh, SA" (SuccessFactors), "Riyadh, Riyadh Province,
 * Saudi Arabia" (Workable), "ARE" (ISO-3), "دبي", double-encoded Arabic.
 * Pure and client-safe; built on the relevance gate's place lists.
 */

export type GccCode = 'AE' | 'SA' | 'QA' | 'KW' | 'BH' | 'OM'

export interface GccLocation {
  countryCode: GccCode
  country: string
  /** Canonical city ("Dubai", "Al Khobar", "Kuwait City"); null when only the country is named. */
  city: string | null
}

export const GCC_COUNTRY_NAMES: Readonly<Record<GccCode, string>> = {
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  OM: 'Oman',
}

interface City {
  name: string
  code: GccCode
  aliases: readonly string[]
}

/** Canonical cities; districts and free zones map to their city. */
const CITIES: readonly City[] = [
  { name: 'Dubai', code: 'AE', aliases: ['dubai', 'dubayy', 'dxb', 'دبي', 'difc', 'dmcc', 'jebel ali', 'dubai internet city', 'dubai silicon oasis', 'jlt', 'business bay', 'dubai media city'] },
  { name: 'Abu Dhabi', code: 'AE', aliases: ['abu dhabi', 'abudhabi', 'abu zabi', 'أبوظبي', 'أبو ظبي', 'mbz city', 'mohammed bin zayed city', 'khalifa city', 'mussafah', 'masdar city'] },
  { name: 'Al Ain', code: 'AE', aliases: ['al ain', 'العين'] },
  { name: 'Sharjah', code: 'AE', aliases: ['sharjah', 'الشارقة'] },
  { name: 'Ajman', code: 'AE', aliases: ['ajman', 'عجمان'] },
  { name: 'Ras Al Khaimah', code: 'AE', aliases: ['ras al khaimah', 'رأس الخيمة'] },
  { name: 'Fujairah', code: 'AE', aliases: ['fujairah', 'الفجيرة'] },
  { name: 'Umm Al Quwain', code: 'AE', aliases: ['umm al quwain', 'أم القيوين'] },
  { name: 'Riyadh', code: 'SA', aliases: ['riyadh', 'riyad', 'ar riyad', 'الرياض'] },
  { name: 'Jeddah', code: 'SA', aliases: ['jeddah', 'jiddah', 'jedda', 'جدة'] },
  { name: 'Dammam', code: 'SA', aliases: ['dammam', 'الدمام'] },
  { name: 'Al Khobar', code: 'SA', aliases: ['al khobar', 'alkhobar', 'khobar', 'الخبر'] },
  { name: 'Dhahran', code: 'SA', aliases: ['dhahran', 'الظهران'] },
  { name: 'Makkah', code: 'SA', aliases: ['makkah', 'mecca', 'مكة'] },
  { name: 'Madinah', code: 'SA', aliases: ['madinah', 'medina', 'al madinah', 'المدينة المنورة'] },
  { name: 'NEOM', code: 'SA', aliases: ['neom', 'نيوم'] },
  { name: 'Jubail', code: 'SA', aliases: ['jubail', 'al jubail', 'الجبيل'] },
  { name: 'Yanbu', code: 'SA', aliases: ['yanbu', 'ينبع'] },
  { name: 'Tabuk', code: 'SA', aliases: ['tabuk', 'تبوك'] },
  { name: 'Abha', code: 'SA', aliases: ['abha'] },
  { name: 'Taif', code: 'SA', aliases: ['taif'] },
  { name: 'Buraidah', code: 'SA', aliases: ['buraidah'] },
  { name: 'Doha', code: 'QA', aliases: ['doha', 'الدوحة'] },
  { name: 'Lusail', code: 'QA', aliases: ['lusail', 'لوسيل'] },
  { name: 'Al Rayyan', code: 'QA', aliases: ['al rayyan', 'الريان'] },
  { name: 'Al Wakrah', code: 'QA', aliases: ['al wakrah'] },
  { name: 'Kuwait City', code: 'KW', aliases: ['kuwait city', 'مدينة الكويت'] },
  { name: 'Salmiya', code: 'KW', aliases: ['salmiya'] },
  { name: 'Hawalli', code: 'KW', aliases: ['hawalli'] },
  { name: 'Ahmadi', code: 'KW', aliases: ['ahmadi'] },
  { name: 'Manama', code: 'BH', aliases: ['manama', 'المنامة'] },
  { name: 'Muharraq', code: 'BH', aliases: ['muharraq', 'المحرق'] },
  { name: 'Riffa', code: 'BH', aliases: ['riffa'] },
  { name: 'Muscat', code: 'OM', aliases: ['muscat', 'masqat', 'مسقط'] },
  { name: 'Salalah', code: 'OM', aliases: ['salalah', 'صلالة'] },
  { name: 'Sohar', code: 'OM', aliases: ['sohar', 'صحار'] },
  { name: 'Nizwa', code: 'OM', aliases: ['nizwa'] },
  { name: 'Duqm', code: 'OM', aliases: ['duqm'] },
]

const CITY_MATCHERS: ReadonlyArray<{ city: City; match: TermMatcher }> = CITIES.map((city) => ({
  city,
  match: termMatcher(city.aliases),
}))

const COUNTRY_MATCHERS: ReadonlyMap<RegionCode, TermMatcher> = new Map(
  TARGET_REGIONS.map((r) => [r.code, termMatcher(r.aliases)] as const),
)

const isGcc = (c: RegionCode): c is GccCode => (GCC_CODES as readonly string[]).includes(c)

/** Position of a matcher's hit in `text`, or Infinity. */
function positionOf(match: TermMatcher, text: string): number {
  const hit = match(text)
  if (hit === null) return Number.POSITIVE_INFINITY
  const at = text.indexOf(hit)
  return at < 0 ? Number.POSITIVE_INFINITY : at
}

function firstCity(text: string): City | null {
  let best: { city: City; at: number } | null = null
  for (const { city, match } of CITY_MATCHERS) {
    const at = positionOf(match, text)
    if (at < (best?.at ?? Number.POSITIVE_INFINITY)) best = { city, at }
  }
  return best?.city ?? null
}

/** The GCC country named first; codes ("SA", "ARE") count when nothing else does. */
function firstCountry(raw: string, text: string): GccCode | null {
  const codes = [...scanPlaces(raw, { trustCodes: true }).regions].filter(isGcc)
  if (codes.length <= 1) return codes[0] ?? null
  const ranked = codes
    .map((code) => ({ code, at: positionOf(COUNTRY_MATCHERS.get(code)!, text) }))
    .sort((a, b) => a.at - b.at)
  return ranked[0]!.code
}

export function parseGccLocation(raw: string | null | undefined): GccLocation | null {
  if (!raw || !raw.trim()) return null
  const repaired = repairMojibake(raw)
  const text = normalizeForMatch(repaired)
  const city = firstCity(text)
  // The city named first sets the country ("Riyadh Saudi Arabia, Dubai
  // United Arab Emirates" → Riyadh); otherwise the country named first.
  const code = city?.code ?? firstCountry(repaired, text)
  if (!code) return null
  return { countryCode: code, country: GCC_COUNTRY_NAMES[code], city: city?.name ?? null }
}
