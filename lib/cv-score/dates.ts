/**
 * v12.0 — CV date parsing. Normalises the many ways CVs write dates to
 * `YYYY-MM` (or the literal `present`).
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const MONTH_NAME = '(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?'
const DATE_TOKEN = `(?:${MONTH_NAME}\\s*'?\\d{2,4}|\\d{1,2}[/.]\\d{4}|\\d{4}[-/.]\\d{1,2}(?![\\d])|(?:19|20)\\d{2})`
const PRESENT = '(?:present|current|now|today|ongoing|date)'

/** Matches "Jan 2020 – Present", "2019-01 to 2022-05", "03/2018 - 06/2020", "2017 – 2019". */
export const DATE_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to|until|through)\\s*(${DATE_TOKEN}|${PRESENT})`,
  'i',
)

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Parse one date token. `isEnd` controls the month used for year-only dates
 * (Jan for starts, Dec for ends) so "2017 – 2019" counts as 3 years.
 */
export function parseCvDate(raw: string | undefined | null, isEnd = false): string | undefined {
  if (!raw) return undefined
  const s = raw.trim().toLowerCase()
  if (!s) return undefined
  if (new RegExp(`^${PRESENT}$`).test(s)) return 'present'
  let m = /^(\d{4})[-/.](\d{1,2})$/.exec(s)
  if (m) return validYm(Number(m[1]), Number(m[2]))
  m = /^(\d{1,2})[/.](\d{4})$/.exec(s)
  if (m) return validYm(Number(m[2]), Number(m[1]))
  m = new RegExp(`^(${MONTH_NAME})\\s*'?(\\d{2,4})$`).exec(s)
  if (m) {
    const month = MONTHS[m[1]!.replace(/\.$/, '').slice(0, m[1]!.startsWith('sept') ? 4 : 3)]
    let year = Number(m[2])
    if (year < 100) year += year > 50 ? 1900 : 2000
    return month ? validYm(year, month) : undefined
  }
  m = /^((?:19|20)\d{2})$/.exec(s)
  if (m) return validYm(Number(m[1]), isEnd ? 12 : 1)
  return undefined
}

function validYm(y: number, mo: number): string | undefined {
  if (y < 1950 || y > 2100 || mo < 1 || mo > 12) return undefined
  return `${y}-${pad(mo)}`
}

/** Extract `{start, end, matched}` from a line containing a date range. */
export function parseDateRange(
  line: string,
): { start?: string; end?: string; matched: string } | null {
  const m = DATE_RANGE_RE.exec(line)
  if (!m) return null
  return {
    start: parseCvDate(m[1], false),
    end: parseCvDate(m[2], true),
    matched: m[0],
  }
}

/** Resolve `present` against a reference date. */
export function resolveEnd(end: string | undefined, now: Date): string | undefined {
  if (end !== 'present') return end
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`
}
