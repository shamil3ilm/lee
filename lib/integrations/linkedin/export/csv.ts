/**
 * Client-safe. A small RFC 4180 CSV reader for LinkedIn's data export:
 * quoted fields with commas, doubled quotes and newlines; CRLF or LF; an
 * optional UTF-8 BOM. LinkedIn puts "Notes:" lines above the header in
 * Connections.csv, so rows are returned as-is and the caller finds the
 * header row (findHeader).
 */

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"' && field === '') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Rows as records keyed by the normalized header ("first name"). The header
 * is the first row that contains every `required` column (case-insensitive),
 * so preamble lines are skipped. Null when no such row exists.
 */
export function readTable(input: string, required: readonly string[]): Array<Record<string, string>> | null {
  const rows = parseCsv(input)
  const want = required.map(norm)
  const at = rows.findIndex((r) => {
    const cols = new Set(r.map(norm))
    return want.every((w) => cols.has(w))
  })
  if (at < 0) return null
  const header = rows[at]!.map(norm)
  return rows.slice(at + 1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}
