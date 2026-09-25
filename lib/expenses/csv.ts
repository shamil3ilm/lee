import { EXPENSE_CATEGORIES, isExpenseCategory, type ExpenseCategory } from '@/lib/db/queries/expenses'

/**
 * Very small RFC-4180 CSV parser — supports quoted fields with embedded
 * commas / quotes / newlines. Not a general-purpose library; scoped to
 * the tiny CSVs the expense import route accepts.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let i = 0
  let inQuotes = false
  const len = input.length
  while (i < len) {
    const ch = input[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      // Skip; treat as part of the following \n.
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  // Trailing field (file without terminating newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

export interface ParsedExpenseRow {
  date: string
  amountCents: number
  currency: string
  category: ExpenseCategory
  subcategory: string | null
  vendor: string | null
  description: string | null
}

export interface ParseError {
  line: number
  message: string
}

export interface ParseResult {
  rows: ParsedExpenseRow[]
  errors: ParseError[]
}

const EXPECTED_HEADERS = [
  'date',
  'amount',
  'currency',
  'category',
  'subcategory',
  'vendor',
  'description',
] as const

/**
 * Parse the amount field into integer minor units. Accepts either a decimal
 * string ("12.50") or an integer ("12"). Trailing symbols like "AED" are
 * stripped so a paste from a bank statement doesn't need pre-processing.
 */
export function parseAmountToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.\-]/g, '').trim()
  if (!cleaned) return null
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/**
 * Turn a CSV string into a set of expense insert rows. The header row is
 * required and must contain the columns listed in EXPECTED_HEADERS (order
 * matters — this keeps the parser simple and predictable). Rows with bad
 * data are captured in `errors` so the UI can surface them without aborting
 * the whole import.
 */
export function parseExpenseCsv(input: string): ParseResult {
  const grid = parseCsv(input)
  if (grid.length === 0) {
    return { rows: [], errors: [{ line: 1, message: 'CSV is empty.' }] }
  }
  const header = grid[0]!.map((s) => s.trim().toLowerCase())
  for (const col of EXPECTED_HEADERS) {
    if (!header.includes(col)) {
      return {
        rows: [],
        errors: [
          {
            line: 1,
            message: `Missing header column "${col}". Expected: ${EXPECTED_HEADERS.join(', ')}.`,
          },
        ],
      }
    }
  }
  const idx = {
    date: header.indexOf('date'),
    amount: header.indexOf('amount'),
    currency: header.indexOf('currency'),
    category: header.indexOf('category'),
    subcategory: header.indexOf('subcategory'),
    vendor: header.indexOf('vendor'),
    description: header.indexOf('description'),
  }

  const rows: ParsedExpenseRow[] = []
  const errors: ParseError[] = []
  for (let i = 1; i < grid.length; i++) {
    const line = i + 1
    const cells = grid[i]!
    const dateRaw = (cells[idx.date] ?? '').trim()
    const amountRaw = (cells[idx.amount] ?? '').trim()
    const currencyRaw = (cells[idx.currency] ?? '').trim() || 'AED'
    const categoryRaw = (cells[idx.category] ?? '').trim().toLowerCase()
    const subcategoryRaw = (cells[idx.subcategory] ?? '').trim()
    const vendorRaw = (cells[idx.vendor] ?? '').trim()
    const descriptionRaw = (cells[idx.description] ?? '').trim()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      errors.push({ line, message: `Invalid date "${dateRaw}" — expected YYYY-MM-DD.` })
      continue
    }
    const amountCents = parseAmountToCents(amountRaw)
    if (amountCents === null) {
      errors.push({ line, message: `Invalid amount "${amountRaw}".` })
      continue
    }
    if (!isExpenseCategory(categoryRaw)) {
      errors.push({
        line,
        message: `Unknown category "${categoryRaw}". Known: ${EXPENSE_CATEGORIES.slice(0, 6).join(', ')}…`,
      })
      continue
    }
    rows.push({
      date: dateRaw,
      amountCents,
      currency: currencyRaw.toUpperCase(),
      category: categoryRaw,
      subcategory: subcategoryRaw || null,
      vendor: vendorRaw || null,
      description: descriptionRaw || null,
    })
  }
  return { rows, errors }
}

function escapeCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return ''
  const s = typeof cell === 'number' ? String(cell) : cell
  const needsQuoting = /[",\n\r]|^\s|\s$/.test(s)
  const doubled = s.replace(/"/g, '""')
  return needsQuoting ? `"${doubled}"` : doubled
}

export interface ExpenseCsvRow {
  date: string
  amountCents: number
  currency: string
  category: string
  subcategory: string | null
  vendor: string | null
  description: string | null
}

export function expensesToCsv(rows: ExpenseCsvRow[]): string {
  const lines: string[] = []
  lines.push(EXPECTED_HEADERS.join(','))
  for (const r of rows) {
    lines.push(
      [
        escapeCell(r.date),
        escapeCell((r.amountCents / 100).toFixed(2)),
        escapeCell(r.currency),
        escapeCell(r.category),
        escapeCell(r.subcategory),
        escapeCell(r.vendor),
        escapeCell(r.description),
      ].join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}
