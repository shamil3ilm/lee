import { describe, it, expect } from 'vitest'
import { checkOutput, extractJson, validateAgainstSchema } from '@/lib/lab/schema-check'

const schema = {
  type: 'object',
  required: ['title', 'score', 'tags'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1 },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    level: { enum: ['junior', 'senior'] },
    note: { type: ['string', 'null'] },
  },
}

describe('validateAgainstSchema', () => {
  it('accepts a conforming object', () => {
    const r = validateAgainstSchema(
      { title: 'x', score: 80, tags: ['a'], level: 'senior', note: null },
      schema,
    )
    expect(r).toEqual({ valid: true, errors: [] })
  })

  it('reports missing required fields', () => {
    const r = validateAgainstSchema({ title: 'x', tags: [] }, schema)
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('score: required')
  })

  it('reports wrong types, including integer vs number', () => {
    const r = validateAgainstSchema({ title: 1, score: 1.5, tags: 'a' }, schema)
    expect(r.valid).toBe(false)
    expect(r.errors.join('\n')).toMatch(/title: expected string/)
    expect(r.errors.join('\n')).toMatch(/score: expected integer/)
    expect(r.errors.join('\n')).toMatch(/tags: expected array/)
  })

  it('checks enum, bounds, array items and additionalProperties', () => {
    const r = validateAgainstSchema(
      { title: '', score: 101, tags: ['a', 2, 'c', 'd'], level: 'staff', extra: true },
      schema,
    )
    const all = r.errors.join('\n')
    expect(all).toMatch(/title: shorter than 1/)
    expect(all).toMatch(/score: above maximum 100/)
    expect(all).toMatch(/tags\[1\]: expected string/)
    expect(all).toMatch(/tags: more than 3 items/)
    expect(all).toMatch(/level: not one of the allowed values/)
    expect(all).toMatch(/extra: not allowed/)
  })

  it('number accepts integers', () => {
    expect(validateAgainstSchema(3, { type: 'number' }).valid).toBe(true)
  })

  it('ignores unknown keywords', () => {
    expect(validateAgainstSchema('x', { type: 'string', format: 'email' }).valid).toBe(true)
  })
})

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('parses a fenced block', () => {
    expect(extractJson('Here:\n```json\n{"a":2}\n```\nDone')).toEqual({ a: 2 })
  })
  it('parses the outermost object span amid prose', () => {
    expect(extractJson('Sure! {"a":{"b":3}} hope that helps')).toEqual({ a: { b: 3 } })
  })
  it('returns undefined for non-JSON', () => {
    expect(extractJson('no json here')).toBeUndefined()
  })
})

describe('checkOutput', () => {
  it('flags non-JSON output as invalid', () => {
    const r = checkOutput('hello', schema)
    expect(r.valid).toBe(false)
    expect(r.errors).toEqual(['output is not valid JSON'])
  })
  it('parses and validates in one go', () => {
    const r = checkOutput('```json\n{"title":"t","score":5,"tags":[]}\n```', schema)
    expect(r.valid).toBe(true)
    expect(r.parsed).toEqual({ title: 't', score: 5, tags: [] })
  })
})
