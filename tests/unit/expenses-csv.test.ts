import { describe, it, expect } from 'vitest'
import {
  expensesToCsv,
  parseAmountToCents,
  parseCsv,
  parseExpenseCsv,
} from '@/lib/expenses/csv'

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })
  it('respects quoted commas and quotes', () => {
    expect(parseCsv('name,note\n"Doe, Jane","She said ""hi"""\n')).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'She said "hi"'],
    ])
  })
  it('handles missing trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('drops empty lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parseAmountToCents', () => {
  it('parses decimals', () => {
    expect(parseAmountToCents('12.50')).toBe(1250)
    expect(parseAmountToCents('0.99')).toBe(99)
  })
  it('parses integers', () => {
    expect(parseAmountToCents('100')).toBe(10000)
  })
  it('strips currency symbols', () => {
    expect(parseAmountToCents('AED 42.00')).toBe(4200)
    expect(parseAmountToCents('$3.14')).toBe(314)
  })
  it('returns null for garbage', () => {
    expect(parseAmountToCents('n/a')).toBe(null)
    expect(parseAmountToCents('')).toBe(null)
  })
})

describe('parseExpenseCsv', () => {
  it('parses valid rows', () => {
    const csv = [
      'date,amount,currency,category,subcategory,vendor,description',
      '2026-09-15,49.99,AED,subscription,streaming,Netflix,',
      '2026-09-16,12,AED,transport,,Uber,Ride home',
    ].join('\n')
    const result = parseExpenseCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      date: '2026-09-15',
      amountCents: 4999,
      currency: 'AED',
      category: 'subscription',
      subcategory: 'streaming',
      vendor: 'Netflix',
      description: null,
    })
  })
  it('reports missing headers', () => {
    const result = parseExpenseCsv('date,amount\n2026-09-15,10')
    expect(result.errors[0]?.message).toContain('currency')
  })
  it('reports bad dates, amounts, categories per row', () => {
    const csv = [
      'date,amount,currency,category,subcategory,vendor,description',
      '2026/09/15,49.99,AED,food,,,',
      '2026-09-16,n/a,AED,food,,,',
      '2026-09-17,10,AED,bogus,,,',
    ].join('\n')
    const result = parseExpenseCsv(csv)
    expect(result.rows).toHaveLength(0)
    expect(result.errors).toHaveLength(3)
  })
  it('rejects empty input', () => {
    const result = parseExpenseCsv('')
    expect(result.errors[0]?.message).toContain('empty')
  })
})

describe('expensesToCsv', () => {
  it('emits a header row and value rows', () => {
    const csv = expensesToCsv([
      {
        date: '2026-09-15',
        amountCents: 4999,
        currency: 'AED',
        category: 'subscription',
        subcategory: 'streaming',
        vendor: 'Netflix',
        description: null,
      },
    ])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('date,amount,currency,category,subcategory,vendor,description')
    expect(lines[1]).toBe('2026-09-15,49.99,AED,subscription,streaming,Netflix,')
  })
})
