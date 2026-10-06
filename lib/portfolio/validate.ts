/**
 * TypeScript port of the portfolio repo's scripts/lib/validate.mjs: a
 * minimal JSON Schema (draft-07 subset) validator. Kept behaviour-identical
 * on purpose — the same keywords, the same error strings — so lee rejects
 * exactly what the portfolio build rejects. Parity is proven by
 * tests/unit/portfolio-validate-parity.test.ts against the original files
 * (vendored in tests/fixtures/portfolio).
 */

export type JsonSchema = Readonly<Record<string, unknown>>

const SUPPORTED = new Set([
  '$schema', '$id', '$comment', 'title', 'description', 'definitions', '$ref',
  'type', 'required', 'properties', 'additionalProperties', 'items',
  'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength',
  'pattern', 'format', 'enum', 'const', 'minimum', 'maximum',
])

const FORMATS: Readonly<Record<string, (v: string) => boolean>> = {
  email: (v) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v),
  uri: (v) => {
    try {
      return Boolean(new URL(v).protocol)
    } catch {
      return false
    }
  },
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (Number.isInteger(value)) return 'integer'
  return typeof value
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value)
  if (type === 'number') return actual === 'number' || actual === 'integer'
  return actual === type
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref "${ref}" (only local refs)`)
  const target = ref
    .slice(2)
    .split('/')
    .reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), root)
  if (!target) throw new Error(`Unresolvable $ref "${ref}"`)
  return target as JsonSchema
}

function checkKeywords(schema: JsonSchema): void {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) throw new Error(`Schema keyword "${key}" is not supported by the validator`)
  }
}

function validateString(value: string, schema: JsonSchema, path: string, errors: string[]): void {
  const minLength = schema.minLength as number | undefined
  const maxLength = schema.maxLength as number | undefined
  if (minLength !== undefined && value.length < minLength) {
    errors.push(`${path}: must be at least ${minLength} character(s)`)
  }
  if (maxLength !== undefined && value.length > maxLength) {
    errors.push(`${path}: must be at most ${maxLength} characters`)
  }
  const pattern = schema.pattern as string | undefined
  if (pattern !== undefined && !new RegExp(pattern, 'u').test(value)) {
    errors.push(`${path}: "${value}" does not match ${pattern}`)
  }
  const format = schema.format as string | undefined
  if (format !== undefined) {
    const check = FORMATS[format]
    if (!check) throw new Error(`Unsupported format "${format}"`)
    if (!check(value)) errors.push(`${path}: "${value}" is not a valid ${format}`)
  }
}

function validateArray(root: JsonSchema, value: unknown[], schema: JsonSchema, path: string, errors: string[]): void {
  const minItems = schema.minItems as number | undefined
  const maxItems = schema.maxItems as number | undefined
  if (minItems !== undefined && value.length < minItems) {
    errors.push(`${path}: must have at least ${minItems} item(s)`)
  }
  if (maxItems !== undefined && value.length > maxItems) {
    errors.push(`${path}: must have at most ${maxItems} items`)
  }
  if (schema.uniqueItems) {
    const seen = new Set<string>()
    value.forEach((item, i) => {
      const key = JSON.stringify(item)
      if (seen.has(key)) errors.push(`${path}/${i}: duplicate item ${key}`)
      seen.add(key)
    })
  }
  const items = schema.items as JsonSchema | undefined
  if (items) value.forEach((item, i) => validateNode(root, item, items, `${path}/${i}`, errors))
}

function validateObject(
  root: JsonSchema,
  value: Record<string, unknown>,
  schema: JsonSchema,
  path: string,
  errors: string[],
): void {
  for (const key of (schema.required as string[] | undefined) ?? []) {
    if (!(key in value)) errors.push(`${path || '/'}: missing required property "${key}"`)
  }
  const props = (schema.properties as Record<string, JsonSchema> | undefined) ?? {}
  const additional = schema.additionalProperties
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key}`
    if (key in props) validateNode(root, child, props[key]!, childPath, errors)
    else if (additional === false) errors.push(`${childPath}: unknown property`)
    else if (typeof additional === 'object' && additional !== null) {
      validateNode(root, child, additional as JsonSchema, childPath, errors)
    }
  }
}

function validateNode(root: JsonSchema, value: unknown, schemaIn: JsonSchema, path: string, errors: string[]): void {
  const schema = typeof schemaIn.$ref === 'string' ? resolveRef(root, schemaIn.$ref) : schemaIn
  checkKeywords(schema)

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string]
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path || '/'}: expected ${types.join(' or ')}, got ${typeOf(value)}`)
      return
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: must be ${JSON.stringify(schema.const)}`)
  }
  const enumValues = schema.enum as unknown[] | undefined
  if (enumValues !== undefined && !enumValues.includes(value)) {
    errors.push(`${path}: must be one of ${enumValues.map((e) => JSON.stringify(e)).join(', ')}`)
  }

  const kind = typeOf(value)
  if (kind === 'string') validateString(value as string, schema, path, errors)
  if (kind === 'array') validateArray(root, value as unknown[], schema, path, errors)
  if (kind === 'object') validateObject(root, value as Record<string, unknown>, schema, path, errors)
  if (kind === 'number' || kind === 'integer') {
    const n = value as number
    const minimum = schema.minimum as number | undefined
    const maximum = schema.maximum as number | undefined
    if (minimum !== undefined && n < minimum) errors.push(`${path}: must be >= ${minimum}`)
    if (maximum !== undefined && n > maximum) errors.push(`${path}: must be <= ${maximum}`)
  }
}

/** Human-readable errors; an empty list means the value is valid. */
export function validateJsonSchema(value: unknown, schema: JsonSchema): string[] {
  const errors: string[] = []
  validateNode(schema, value, schema, '', errors)
  return errors
}
