import { createHash } from 'node:crypto'

/**
 * Stable-hash a plain object (or any JSON-serializable value) to a hex sha256.
 *
 * The whole point is determinism: `sha256Fields({a:1, b:2})` must equal
 * `sha256Fields({b:2, a:1})` so callers can compose snapshots from record
 * fields without worrying about key insertion order. We achieve this by
 * recursively stringifying with sorted keys and dropping `undefined` (JSON
 * treats undefined inconsistently — object keys drop it, array slots keep it
 * as null). Dates round-trip through `.toISOString()` so different Date
 * instances representing the same moment hash the same.
 */
export function sha256Fields(input: unknown): string {
  const canonical = canonicalize(input)
  return createHash('sha256').update(canonical).digest('hex')
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    // JSON does not distinguish NaN / Infinity; collapse to null for a
    // deterministic hash (matches `JSON.stringify`'s behaviour).
    if (!Number.isFinite(value)) return 'null'
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean') return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort()
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`)
    return `{${parts.join(',')}}`
  }
  // Bigint, function, symbol — collapse to null so we never throw at hash
  // time. Callers should not pass these; if they do, at least it's stable.
  return 'null'
}
