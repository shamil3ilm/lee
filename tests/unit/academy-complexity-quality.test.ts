import { describe, expect, it } from 'vitest'
import { complexityScore, fitComplexity } from '@/lib/academy/runner/complexity'
import { rng } from '@/lib/academy/runner/generate'
import { SCALE_SIZES } from '@/lib/academy/runner/generate'
import { lineMetrics, qualityAdvice, qualityScore, sanitizeMetrics } from '@/lib/academy/runner/quality'
import { analyzeJs } from '@/lib/academy/runner/quality-js'

/** Synthetic timings c·f(n)·(1 ± noise) + overhead, at the runner's sizes. */
function timings(f: (n: number) => number, c: number, noise: number, seed = 1, overhead = 0): Array<{ n: number; ms: number }> {
  const r = rng(seed)
  return SCALE_SIZES.slice(0, 8).map((n) => ({ n, ms: (c * f(n) + overhead) * (1 + noise * (2 * r() - 1)) }))
}

describe('complexity fit (synthetic timings)', () => {
  const classes = [
    ['O(1)', () => 1, 0.01],
    ['O(log n)', (n: number) => Math.log2(n), 0.001],
    ['O(n)', (n: number) => n, 1e-5],
    ['O(n log n)', (n: number) => n * Math.log2(n), 1e-6],
    ['O(n^2)', (n: number) => n * n, 1e-8],
  ] as const

  it.each(classes)('recovers %s from clean timings', (label, f, c) => {
    expect(fitComplexity(timings(f, c, 0)).label).toBe(label)
  })

  it.each(classes)('recovers %s with 5%% noise across seeds', (label, f, c) => {
    for (const seed of [1, 2, 3, 17, 20, 21]) expect(fitComplexity(timings(f, c, 0.05, seed)).label).toBe(label)
  })

  it('reports slopes near 1 for linear and 2 for quadratic', () => {
    expect(fitComplexity(timings((n) => n, 1e-5, 0)).slope).toBeCloseTo(1, 5)
    expect(fitComplexity(timings((n) => n * n, 1e-8, 0)).slope).toBeCloseTo(2, 5)
  })

  it('returns unknown with too few points, O(1) when every call is below the timer', () => {
    expect(fitComplexity([{ n: 256, ms: 1 }, { n: 512, ms: 2 }]).label).toBe('unknown')
    expect(fitComplexity(SCALE_SIZES.slice(0, 5).map((n) => ({ n, ms: 0 }))).label).toBe('O(1)')
  })

  it('scores measured against the target class', () => {
    expect(complexityScore('O(n)', 'O(n)')).toBe(100)
    expect(complexityScore('O(1)', 'O(n)')).toBe(100)
    expect(complexityScore('O(n log n)', 'O(n)')).toBe(85)
    expect(complexityScore('O(n^2)', 'O(n log n)')).toBe(60)
    expect(complexityScore('O(n^2)', 'O(n)')).toBe(25)
  })
})

describe('JS quality (acorn)', () => {
  it('measures function length, nesting, branches and short names', () => {
    const src = `function score(list) {
  let q = 0
  for (const item of list) {
    if (item > 0) {
      if (item % 2 === 0 && item < 10) {
        q++
      } else if (item > 100) {
        q--
      }
    }
  }
  return q
}`
    const r = analyzeJs(src)
    if (!r.ok) throw new Error(r.error)
    expect(r.analysis.metrics).toMatchObject({ maxFnLength: 13, nesting: 3, namingIssues: 1, method: 'ast' })
    expect(r.analysis.metrics.cyclomatic).toBe(6)
    expect(r.analysis.forbidden).toBeNull()
  })

  it('flags dynamic import and importScripts', () => {
    const a = analyzeJs('function f() { return import("https://example.com/x.js") }')
    expect(a.ok && a.analysis.forbidden).toMatch(/import\(\)/)
    const b = analyzeJs('function f() { importScripts("x") }')
    expect(b.ok && b.analysis.forbidden).toMatch(/importScripts/)
  })

  it('returns a syntax error for unparsable code', () => {
    expect(analyzeJs('function (').ok).toBe(false)
  })
})

describe('line-based quality and scoring', () => {
  it('estimates Python metrics', () => {
    const py = `def total(items):
    s = 0
    for i in items:
        if i > 0:
            s += i
    return s
`
    expect(lineMetrics(py, 'python')).toMatchObject({ maxFnLength: 6, nesting: 2, namingIssues: 1, method: 'lines' })
  })

  it('estimates PHP metrics', () => {
    const php = `<?php
function total(array $items): int
{
    $s = 0;
    foreach ($items as $i) {
        if ($i > 0) {
            $s += $i;
        }
    }
    return $s;
}`
    const m = lineMetrics(php, 'php')
    expect(m).toMatchObject({ maxFnLength: 10, nesting: 2, namingIssues: 1 })
    expect(m.cyclomatic).toBe(3)
  })

  it('scores and advises', () => {
    const clean = { maxFnLength: 10, nesting: 2, cyclomatic: 4, namingIssues: 0, method: 'ast' as const }
    expect(qualityScore(clean)).toBe(100)
    expect(qualityAdvice(clean)).toEqual([])
    const messy = { maxFnLength: 70, nesting: 5, cyclomatic: 20, namingIssues: 6, method: 'ast' as const }
    // 100 − 30 (length, capped) − 20 (nesting) − 20 (branches, capped) − 20 (names, capped)
    expect(qualityScore(messy)).toBe(10)
    expect(qualityAdvice(messy)).toHaveLength(4)
  })

  it('sanitises browser-reported metrics', () => {
    expect(sanitizeMetrics({ maxFnLength: 3.6, nesting: -2, cyclomatic: 1e9, namingIssues: 0 })).toEqual({
      maxFnLength: 4,
      nesting: 0,
      cyclomatic: 10_000,
      namingIssues: 0,
      method: 'ast',
    })
    expect(sanitizeMetrics({ maxFnLength: 'x' })).toBeNull()
    expect(sanitizeMetrics(null)).toBeNull()
  })
})
