/**
 * v14 — small JSON-Schema subset validator for Arena outputs. Covers what
 * people actually write in a prompt schema: `type` (incl. arrays of types),
 * `properties`, `required`, `additionalProperties: false`, `items`, `enum`,
 * `const`, `minItems`/`maxItems`, `minLength`/`maxLength`,
 * `minimum`/`maximum`. Unknown keywords are ignored (lenient by design —
 * this scores "did the model follow the shape", not full spec compliance).
 * Avoids pulling ajv into the bundle.
 */

export type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  enum?: unknown[]
  const?: unknown
  minItems?: number
  maxItems?: number
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
}

export interface SchemaCheckResult {
  valid: boolean
  errors: string[]
}

const MAX_ERRORS = 20

function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v)
  if (t === 'number') return actual === 'number' || actual === 'integer'
  return actual === t
}

function check(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  if (errors.length >= MAX_ERRORS || !schema || typeof schema !== 'object') return
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path || '$'}: expected ${types.join('|')}, got ${typeOf(value)}`)
      return
    }
  }
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${path || '$'}: must equal ${JSON.stringify(schema.const)}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path || '$'}: not one of the allowed values`)
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push(`${path || '$'}: shorter than ${schema.minLength}`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      errors.push(`${path || '$'}: longer than ${schema.maxLength}`)
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${path || '$'}: below minimum ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${path || '$'}: above maximum ${schema.maximum}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${path || '$'}: fewer than ${schema.minItems} items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(`${path || '$'}: more than ${schema.maxItems} items`)
    if (schema.items) value.forEach((item, i) => check(item, schema.items as JsonSchema, `${path}[${i}]`, errors))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path ? `${path}.` : ''}${key}: required`)
    }
    const props = schema.properties ?? {}
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) check(obj[key], sub, path ? `${path}.${key}` : key, errors)
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) errors.push(`${path ? `${path}.` : ''}${key}: not allowed`)
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) check(obj[key], schema.additionalProperties, path ? `${path}.${key}` : key, errors)
      }
    }
  }
}

export function validateAgainstSchema(value: unknown, schema: object): SchemaCheckResult {
  const errors: string[] = []
  check(value, schema as JsonSchema, '', errors)
  return { valid: errors.length === 0, errors }
}

/**
 * Pull a JSON value out of a model reply: raw JSON, a ```json fenced block,
 * or the outermost {...}/[...] span. Returns undefined when nothing parses.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s)
    } catch {
      return undefined
    }
  }
  const direct = tryParse(trimmed)
  if (direct !== undefined) return direct
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fence?.[1]) {
    const fenced = tryParse(fence[1].trim())
    if (fenced !== undefined) return fenced
  }
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const a = trimmed.indexOf(open)
    const b = trimmed.lastIndexOf(close)
    if (a >= 0 && b > a) {
      const span = tryParse(trimmed.slice(a, b + 1))
      if (span !== undefined) return span
    }
  }
  return undefined
}

/** Parse + validate in one step. `parsed` is undefined when the output isn't JSON. */
export function checkOutput(
  text: string,
  schema: object,
): { parsed: unknown; valid: boolean; errors: string[] } {
  const parsed = extractJson(text)
  if (parsed === undefined) return { parsed, valid: false, errors: ['output is not valid JSON'] }
  const r = validateAgainstSchema(parsed, schema)
  return { parsed, ...r }
}
