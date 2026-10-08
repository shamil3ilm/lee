/** ISO 3166-1 alpha-2 codes (officially assigned), for the country picker. */
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'

export const COUNTRY_CODES: readonly string[] = CODES.split(' ')

export interface Country {
  code: string
  name: string
}

let cache: Country[] | null = null

/** English country names from `Intl.DisplayNames`, sorted by name. */
export function countryList(): Country[] {
  if (cache) return cache
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    names = null
  }
  cache = COUNTRY_CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )
  return cache
}

export function countryName(code: string): string {
  return countryList().find((c) => c.code === code)?.name ?? code
}

/** Codes from a stored CSV ("SG, de, xx" → ["SG", "DE"]), known codes only, in order, deduped. */
export function parseCountryCsv(csv: string): string[] {
  const out: string[] = []
  for (const part of csv.split(',')) {
    const c = part.trim().toUpperCase()
    if (COUNTRY_CODES.includes(c) && !out.includes(c)) out.push(c)
  }
  return out
}

/** Countries whose name or code matches the query (code exact match first). */
export function searchCountries(query: string, exclude: readonly string[] = [], limit = 8): Country[] {
  const q = query.trim().toLowerCase()
  const pool = countryList().filter((c) => !exclude.includes(c.code))
  if (!q) return pool.slice(0, limit)
  const exact = pool.filter((c) => c.code.toLowerCase() === q)
  const starts = pool.filter((c) => c.code.toLowerCase() !== q && c.name.toLowerCase().startsWith(q))
  const contains = pool.filter(
    (c) => c.code.toLowerCase() !== q && !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q),
  )
  return [...exact, ...starts, ...contains].slice(0, limit)
}
