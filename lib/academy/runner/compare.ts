import type { CompareSpec, SqlResult } from '@/lib/academy/problems/schema'

/**
 * Output comparison for the coding harness (v13 §4): deep equality with an
 * optional float tolerance and unordered top-level (and inner) arrays. The
 * server compares hidden outputs with this; the browser only compares the
 * visible samples. Pure and client-safe.
 */

export interface CompareOptions {
  tolerance?: number
  /** Treat an empty array and an empty object as equal (PHP's json_encode of []). */
  looseEmpty?: boolean
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isEmptyContainer(v: unknown): boolean {
  return (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && Object.keys(v).length === 0)
}

function numbersEqual(a: number, b: number, tolerance: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b)
  if (tolerance > 0) return Math.abs(a - b) <= tolerance
  return a === b
}

export function deepEqual(a: unknown, b: unknown, opts: CompareOptions = {}): boolean {
  if (typeof a === 'number' && typeof b === 'number') return numbersEqual(a, b, opts.tolerance ?? 0)
  if (a === b) return true
  // JSON has no undefined: a missing result equals null.
  if ((a === undefined || a === null) && (b === undefined || b === null)) return true
  if (opts.looseEmpty && isEmptyContainer(a) && isEmptyContainer(b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i], opts))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined)
    const kb = Object.keys(b).filter((k) => b[k] !== undefined)
    if (ka.length !== kb.length) return false
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k], opts))
  }
  return false
}

/** A canonical string for sorting values (stable across key order). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (isPlainObject(v)) {
    const keys = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null) ?? 'null'
}

function sortedByCanonical(list: readonly unknown[]): unknown[] {
  return [...list].sort((x, y) => (canonical(x) < canonical(y) ? -1 : canonical(x) > canonical(y) ? 1 : 0))
}

/** Multiset match with tolerance (greedy; fine for the small outputs tests use). */
function unorderedEqual(a: readonly unknown[], b: readonly unknown[], opts: CompareOptions): boolean {
  if (a.length !== b.length) return false
  if (!opts.tolerance) {
    const sa = sortedByCanonical(a)
    const sb = sortedByCanonical(b)
    return sa.every((x, i) => deepEqual(x, sb[i], opts))
  }
  const used = new Array<boolean>(b.length).fill(false)
  return a.every((x) => {
    const j = b.findIndex((y, k) => !used[k] && deepEqual(x, y, opts))
    if (j < 0) return false
    used[j] = true
    return true
  })
}

function innerSorted(v: unknown): unknown {
  return Array.isArray(v) ? sortedByCanonical(v) : v
}

/** Compare a function's output with the expected value per the problem's compare spec. */
export function outputsMatch(actual: unknown, expected: unknown, spec: Partial<CompareSpec> = {}, extra: CompareOptions = {}): boolean {
  const opts: CompareOptions = { ...extra, tolerance: spec.tolerance ?? extra.tolerance }
  if (spec.mode === 'unordered' && Array.isArray(actual) && Array.isArray(expected)) {
    const a = spec.unorderedInner ? actual.map(innerSorted) : actual
    const e = spec.unorderedInner ? expected.map(innerSorted) : expected
    return unorderedEqual(a, e, opts)
  }
  return deepEqual(actual, expected, opts)
}

// --- SQL result sets ---------------------------------------------------------

/** Numbers come back from Postgres as numbers, numeric strings or bigints. */
function sqlCell(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v)
  if (v instanceof Date) {
    const iso = v.toISOString()
    // A DATE column (midnight UTC) compares as "YYYY-MM-DD".
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  return v
}

/** JSON-safe cells (dates as text, bigints as numbers), names kept: what a runner reports. */
export function normalizeSqlCells(r: SqlResult): SqlResult {
  return { columns: [...r.columns], rows: r.rows.map((row) => row.map((v) => (typeof v === 'bigint' || v instanceof Date ? sqlCell(v) : v))) }
}

export function normalizeSqlResult(r: SqlResult): SqlResult {
  return {
    columns: r.columns.map((c) => c.toLowerCase()),
    rows: r.rows.map((row) => row.map(sqlCell)),
  }
}

/** Column names (case-insensitive, in order) and rows (ordered or as a multiset); numbers within 1e-6. */
export function sqlResultsMatch(actual: SqlResult, expected: SqlResult, ordered: boolean): boolean {
  const a = normalizeSqlResult(actual)
  const e = normalizeSqlResult(expected)
  if (!deepEqual(a.columns, e.columns)) return false
  const opts = { tolerance: 1e-6 }
  return ordered ? deepEqual(a.rows, e.rows, opts) : unorderedEqual(a.rows, e.rows, opts)
}
