import type { PlaceScan } from './places'
import { normalizeForMatch } from './text'

/**
 * Remote eligibility and relocation signals the location rule reads on top
 * of the place lists:
 *   - working-hours windows ("UTC+1 to +9", "US time zones only"): a remote
 *     role is workable from home when its window overlaps the user's own
 *     offset by at most four hours;
 *   - relocation / visa sponsorship offers ("relocation package", "we
 *     sponsor visas", "Blue Card sponsorship"), never when negated ("we are
 *     unable to sponsor").
 * Pure and client-safe.
 */

const WINDOW = 8_000

/** UTC offsets (hours) for the countries a user can be based in. */
const HOME_OFFSET: Readonly<Record<string, number>> = {
  IN: 5.5, AE: 4, OM: 4, SA: 3, QA: 3, KW: 3, BH: 3, PK: 5, LK: 5.5, BD: 6, NP: 5.75,
}

export function homeOffset(basedIn: string | null | undefined): number | null {
  return basedIn ? (HOME_OFFSET[basedIn] ?? null) : null
}

/** Hours a remote role's window may sit from home and still be workable. */
export const TZ_TOLERANCE_HOURS = 4

const UTC_OFFSET = /\b(?:utc|gmt)\s*([+-−])\s*(\d{1,2})(?:[:.]?(30|45|00))?(?![\d])/g

/** Every explicit UTC/GMT offset named in the text. */
export function offsetsIn(text: string): number[] {
  const t = normalizeForMatch(text).replace(/−/g, '-')
  const out: number[] = []
  UTC_OFFSET.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = UTC_OFFSET.exec(t)) !== null) {
    const hours = Number(m[2]) + (m[3] === '30' ? 0.5 : m[3] === '45' ? 0.75 : 0)
    if (hours <= 14) out.push(m[1] === '-' ? -hours : hours)
  }
  return out
}

/**
 * True when some named offset is within the tolerance of home, false when
 * offsets are named but all far away, null when none is named.
 */
export function windowFits(text: string, home: number | null): boolean | null {
  if (home === null) return null
  const offsets = offsetsIn(text)
  if (offsets.length === 0) return null
  return offsets.some((o) => Math.abs(o - home) <= TZ_TOLERANCE_HOURS)
}

const US_HOURS_ONLY =
  /\b(?:(?:us|u\.s\.|american|north american|pst|pdt|est|edt|cst|eastern|pacific|central|mountain)\s+(?:time\s*zones?|timezones?|business hours|working hours|hours))\s*(?:only|required|is required|are required|\(required\))/
const FLEXIBLE = /\b(?:flexible hours|async|asynchronous|any time ?zone|all time ?zones|overlap of \d|some overlap)\b/

/** "US time zones only" with no sign of flexibility. */
export function usHoursOnly(description: string | null | undefined): boolean {
  const d = normalizeForMatch((description ?? '').slice(0, WINDOW))
  return US_HOURS_ONLY.test(d) && !FLEXIBLE.test(d)
}

const OPEN_WORLDWIDE =
  /\b(?:work from anywhere|anywhere in the world|from any country|hire (?:globally|worldwide|anywhere)|hiring (?:globally|worldwide)|employer of record|eor (?:partner|platform|model)|via (?:deel|remote\.com|oyster)|global(?:ly)? distributed team)\b/

/** "Work from anywhere", "we hire through an employer of record": open worldwide. */
export function openWorldwide(description: string | null | undefined): boolean {
  return OPEN_WORLDWIDE.test(normalizeForMatch((description ?? '').slice(0, WINDOW)))
}

const RELOCATION_OFFERED: readonly RegExp[] = [
  /\brelocation (?:package|assistance|support|allowance|bonus|budget|help|is (?:provided|offered|available|supported))\b/,
  /\b(?:we|company|employer) (?:will |can |do |does )?(?:sponsor|provide|offer|support) (?:the |your |a )?(?:work |employment )?(?:visas?|work permits?|relocation)\b/,
  /\bvisa sponsorship (?:is )?(?:available|provided|offered|possible|included)\b/,
  /\b(?:offer|offers|offering|provide|provides|providing|with) (?:full )?(?:visa sponsorship|relocation)\b/,
  /\b(?:eu )?blue card (?:sponsorship|support)\b|\bskilled worker visa (?:sponsorship|sponsored)\b|\bh-?1b (?:sponsorship|transfer)\b/,
  /\bhelp (?:you )?(?:with )?(?:relocating|relocation|your visa)\b/,
]
const NEGATED =
  /\b(?:no|not|unable to|cannot|can ?not|can't|don't|do not|won't|will not|without)\b[^.;\n]{0,40}\b(?:sponsor|sponsorship|relocat)/

/** A posting outside the user's regions that explicitly offers relocation or a visa. */
export function relocationOffered(description: string | null | undefined): boolean {
  const d = normalizeForMatch((description ?? '').slice(0, WINDOW))
  if (NEGATED.test(d)) return false
  return RELOCATION_OFFERED.some((re) => re.test(d))
}

const EU_ISO = new Set([
  'DE', 'FR', 'NL', 'ES', 'PT', 'IT', 'BE', 'AT', 'PL', 'SE', 'NO', 'DK', 'FI', 'CZ', 'RO', 'BG', 'HU',
  'GR', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY', 'HR', 'SK', 'SI', 'CH', 'IS',
])

/** A relocation country preference (ISO-2 or a place group) → the place-list code it falls under. */
function placeCode(code: string): string {
  if (EU_ISO.has(code)) return 'EU'
  if (code === 'NZ') return 'AU'
  return code
}

/**
 * Countries the posting names that the user accepts relocating to for a
 * sponsored role: any foreign place when the list is empty.
 */
export function relocationTarget(located: PlaceScan, countries: readonly string[]): string | null {
  const foreign = [...located.foreign]
  if (foreign.length === 0) return null
  if (countries.length === 0) return foreign[0]!
  const wanted = new Set(countries.map(placeCode))
  return foreign.find((c) => wanted.has(c)) ?? null
}
