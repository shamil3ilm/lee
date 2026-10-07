import { describe, expect, it } from 'vitest'
import { deepEqual, outputsMatch, sqlResultsMatch } from '@/lib/academy/runner/compare'
import { generateArgs, rng } from '@/lib/academy/runner/generate'
import { compileJs, consoleSink, runCase, runJsCases, timeCall, toJsonValue } from '@/lib/academy/runner/js-harness'
import { singleStatement } from '@/lib/academy/runner/sql-harness'
import { errorType, judge, passRate, type JudgeCase } from '@/lib/academy/runner/verdict'

describe('compare', () => {
  it('deep-compares nested values regardless of key order', () => {
    expect(deepEqual({ a: [1, { b: 2 }], c: 'x' }, { c: 'x', a: [1, { b: 2 }] })).toBe(true)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('treats null and undefined as the same JSON value', () => {
    expect(deepEqual(undefined, null)).toBe(true)
    expect(deepEqual({ a: undefined }, {})).toBe(true)
  })

  it('applies a float tolerance anywhere in the value', () => {
    expect(outputsMatch([0.1 + 0.2, { x: 1.0000001 }], [0.3, { x: 1 }], { tolerance: 1e-6 })).toBe(true)
    expect(outputsMatch(0.3001, 0.3, { tolerance: 1e-6 })).toBe(false)
    expect(outputsMatch(0.1 + 0.2, 0.3)).toBe(false)
  })

  it('compares unordered top-level and inner arrays', () => {
    expect(outputsMatch([[3, 1], [2]], [[2], [1, 3]], { mode: 'unordered', unorderedInner: true })).toBe(true)
    expect(outputsMatch([[3, 1], [2]], [[2], [1, 3]], { mode: 'unordered' })).toBe(false)
    expect(outputsMatch([1, 1, 2], [1, 2, 2], { mode: 'unordered' })).toBe(false)
    expect(outputsMatch([1.0000001, 2], [2, 1], { mode: 'unordered', tolerance: 1e-6 })).toBe(true)
  })

  it('lets PHP empty arrays equal empty objects only when asked', () => {
    expect(deepEqual([], {})).toBe(false)
    expect(deepEqual({ items: [] }, { items: {} }, { looseEmpty: true })).toBe(true)
  })

  it('compares SQL results by column name and rows, numbers as numbers', () => {
    const expected = { columns: ['name', 'total'], rows: [['a', 3], ['b', 1.5]] }
    expect(sqlResultsMatch({ columns: ['NAME', 'total'], rows: [['a', '3'], ['b', '1.50']] }, expected, true)).toBe(true)
    expect(sqlResultsMatch({ columns: ['name', 'total'], rows: [['b', 1.5], ['a', 3]] }, expected, true)).toBe(false)
    expect(sqlResultsMatch({ columns: ['name', 'total'], rows: [['b', 1.5], ['a', 3]] }, expected, false)).toBe(true)
    expect(sqlResultsMatch({ columns: ['name', 'sum'], rows: [['a', 3], ['b', 1.5]] }, expected, true)).toBe(false)
  })
})

describe('js harness', () => {
  it('compiles a named function and runs cases on copies of the input', () => {
    const c = compileJs('function f(a) { a.push(1); return a.length }', 'f', consoleSink())
    if (!c.ok) throw new Error(c.error)
    const input = [1, 2]
    expect(runJsCases(c.fn, [[input], [input]]).map((r) => (r.ok ? r.output : r.error))).toEqual([3, 3])
    expect(input).toEqual([1, 2])
  })

  it('reports syntax errors and a missing function as compile errors', () => {
    const bad = compileJs('function f( {', 'f', consoleSink())
    expect(bad.ok).toBe(false)
    const missing = compileJs('function g() {}', 'f', consoleSink())
    expect(missing.ok ? '' : missing.error).toBe('Define a function named f.')
  })

  it('captures console output and runtime errors', () => {
    const sink = consoleSink()
    const c = compileJs('function f(x) { console.log("x is", x); return x.y.z }', 'f', sink)
    if (!c.ok) throw new Error(c.error)
    const r = runCase(c.fn, [{}])
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.error).toMatch(/^TypeError/)
    expect(sink.lines).toEqual(['x is {}'])
  })

  it('rejects async results and normalises to JSON', () => {
    const c = compileJs('async function f() { return 1 }', 'f', consoleSink())
    if (!c.ok) throw new Error(c.error)
    expect(runCase(c.fn, []).ok).toBe(false)
    expect(toJsonValue(new Set([1, 2]))).toEqual([1, 2])
    expect(toJsonValue(undefined)).toBeNull()
    expect(toJsonValue({ a: Number.NaN })).toEqual({ a: null })
  })

  it('times a call with batching so tiny calls still measure', () => {
    const ms = timeCall(() => 1, [])
    expect(ms).toBeGreaterThanOrEqual(0)
    expect(ms).toBeLessThan(5)
  })
})

describe('generators', () => {
  it('are deterministic per seed and size', () => {
    const specs = [{ t: 'ints', min: 0, max: 99 } as const, { t: 'n' } as const]
    expect(generateArgs(specs, 256, 3)).toEqual(generateArgs(specs, 256, 3))
    expect(generateArgs(specs, 256, 3)).not.toEqual(generateArgs(specs, 256, 4))
    const [list, n] = generateArgs(specs, 256, 3) as [number[], number]
    expect(list).toHaveLength(256)
    expect(n).toBe(256)
  })

  it('makes distinct and sorted ints, strings, trees, edges and records', () => {
    const [d] = generateArgs([{ t: 'ints', min: 1, max: 10_000, distinct: true, sorted: true }], 300, 1) as [number[]]
    expect(new Set(d).size).toBe(300)
    expect([...d].sort((a, b) => a - b)).toEqual(d)
    const [s] = generateArgs([{ t: 'str', alphabet: 'ab' }], 50, 1) as [string]
    expect(s).toMatch(/^[ab]{50}$/)
    const [tree] = generateArgs([{ t: 'tree' }], 7, 1) as [{ val: number }]
    expect(tree.val).toBe(4)
    const [edges] = generateArgs([{ t: 'edges', extra: 1 }], 10, 1) as [number[][]]
    expect(edges.length).toBeGreaterThanOrEqual(9)
    const [objs] = generateArgs([{ t: 'objs', len: 3, fields: { id: { t: 'seq', prefix: 'k' }, at: { t: 'ascInt', step: 5 } } }], 99, 1)
    expect(objs).toEqual([
      { id: 'k0', at: 0 },
      { id: 'k1', at: 5 },
      { id: 'k2', at: 10 },
    ])
  })

  it('rng stays in [0, 1)', () => {
    const r = rng(42)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('verdict mapping', () => {
  const cases: JudgeCase[] = [
    { expected: 1, visible: true, args: [1] },
    { expected: 2, visible: false },
    { expected: 3, visible: false },
  ]
  const eq = (a: unknown, b: unknown) => a === b
  const ok = (output: unknown) => ({ ok: true as const, output, ms: 1.4 })

  it('accepts when every case matches', () => {
    const j = judge(cases, { compileError: null, timedOut: false, cases: [ok(1), ok(2), ok(3)] }, eq)
    expect(j).toMatchObject({ verdict: 'accepted', passed: 3, total: 3, failed: null, runtimeMs: 4 })
  })

  it('shows the first failing visible case with its input', () => {
    const j = judge(cases, { compileError: null, timedOut: false, cases: [ok(9), ok(2), ok(3)] }, eq)
    expect(j.verdict).toBe('wrong_answer')
    expect(j.failed).toEqual({ kind: 'visible', index: 1, args: [1], expected: 1, actual: 9, error: null })
    expect(j.passed).toBe(2)
  })

  it('reports a hidden failure by number only, never its input or error text', () => {
    const j = judge(cases, { compileError: null, timedOut: false, cases: [ok(1), ok(2), { ok: false, error: "KeyError: 'secret-input'", ms: 0 }] }, eq)
    expect(j.verdict).toBe('runtime_error')
    expect(j.failed).toEqual({ kind: 'hidden', index: 2, errorType: 'KeyError' })
    expect(JSON.stringify(j)).not.toContain('secret-input')
  })

  it('maps unreached cases to Time Limit Exceeded and compile errors first', () => {
    expect(judge(cases, { compileError: null, timedOut: true, cases: [ok(1)] }, eq).verdict).toBe('time_limit')
    const ce = judge(cases, { compileError: 'SyntaxError: x', timedOut: false, cases: [] }, eq)
    expect(ce).toMatchObject({ verdict: 'compile_error', passed: 0, message: 'SyntaxError: x' })
  })

  it('derives error types and pass rates', () => {
    expect(errorType('TypeError: a is undefined')).toBe('TypeError')
    expect(errorType('ZeroDivisionError: division by zero')).toBe('ZeroDivisionError')
    expect(errorType('weird')).toBe('Error')
    expect(passRate({ passed: 1, total: 3 })).toBe(33)
    expect(passRate({ passed: 0, total: 0 })).toBe(0)
  })
})

describe('sql single statement', () => {
  it('accepts one SELECT or WITH and strips comments and the semicolon', () => {
    expect(singleStatement('-- hi\nSELECT 1;')).toEqual({ ok: true, sql: 'SELECT 1' })
    expect(singleStatement('with x as (select 1) select * from x').ok).toBe(true)
    expect(singleStatement("select 'a;b'").ok).toBe(true)
  })

  it('rejects multiple statements and writes', () => {
    expect(singleStatement('select 1; select 2').ok).toBe(false)
    expect(singleStatement('drop table users').ok).toBe(false)
    expect(singleStatement('  ').ok).toBe(false)
  })
})
