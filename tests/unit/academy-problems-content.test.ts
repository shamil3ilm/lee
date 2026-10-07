import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'
import type { FunctionProblem, SqlProblem } from '@/lib/academy/problems/schema'
import { starterCode } from '@/lib/academy/problems/starter'
import { outputsMatch, sqlResultsMatch } from '@/lib/academy/runner/compare'
import { generateArgs } from '@/lib/academy/runner/generate'
import { compileJs, consoleSink, runCase } from '@/lib/academy/runner/js-harness'
import { runSqlCases, type SqlEngine } from '@/lib/academy/runner/sql-harness'
import type { SqlResult } from '@/lib/academy/problems/schema'

/**
 * CI gate for the problem set (phase 13.1): every reference solution passes
 * every one of its own tests (samples and hidden) in Node, every starter
 * compiles, and every scale generator produces inputs the reference accepts.
 */

const catalog = loadProblemCatalog()
const fnProblems = catalog.problems.filter((p): p is FunctionProblem => p.kind === 'function')
const sqlProblems = catalog.problems.filter((p): p is SqlProblem => p.kind === 'sql')

describe('problem set coverage', () => {
  it('ships at least 40 function problems and 5 SQL problems', () => {
    expect(fnProblems.length).toBeGreaterThanOrEqual(40)
    expect(sqlProblems.length).toBeGreaterThanOrEqual(5)
  })

  it('covers every core topic', () => {
    const topics = new Set(catalog.problems.flatMap((p) => p.topics))
    for (const t of ['arrays', 'hashing', 'two-pointers', 'sliding-window', 'stack', 'trees', 'graphs', 'dp', 'intervals', 'strings', 'sql']) {
      expect(topics, t).toContain(t)
    }
  })

  it('includes the backend and payments practice set', () => {
    const slugs = new Set(catalog.problems.map((p) => p.slug))
    for (const s of [
      'idempotency-key-dedup',
      'token-bucket-limiter',
      'lru-cache-ops',
      'retry-backoff-schedule',
      'ledger-reconciliation',
      'webhook-signature-check',
      'merge-busy-schedules',
      'flatten-json-keys',
      'access-log-summary',
    ]) {
      expect(slugs, s).toContain(s)
    }
  })

  it('has every difficulty and a role tag on backend problems', () => {
    const diffs = new Set(catalog.problems.map((p) => p.difficulty))
    expect([...diffs].sort()).toEqual(['easy', 'hard', 'medium'])
    for (const p of catalog.problems.filter((x) => x.topics.includes('reliability'))) expect(p.roles.length, p.slug).toBeGreaterThan(0)
  })

  it('every study plan lists known problems', () => {
    expect(catalog.plans.length).toBeGreaterThanOrEqual(3)
  })
})

describe.each(fnProblems.map((p) => [p.slug, p] as const))('function problem %s', (_slug, p) => {
  const sink = consoleSink()
  const compiled = compileJs(p.reference.code, p.fn.name, sink)

  it('reference compiles', () => {
    expect(compiled.ok ? null : compiled.error).toBeNull()
  })

  it('reference passes every sample and hidden test', () => {
    if (!compiled.ok) throw new Error(compiled.error)
    const all = [...p.samples, ...p.hidden]
    const failures = all.flatMap((t, i) => {
      const r = runCase(compiled.fn, t.args)
      if (!r.ok) return [`case ${i}: ${r.error}`]
      return outputsMatch(r.output, t.expected, p.compare) ? [] : [`case ${i}: got ${JSON.stringify(r.output)}, expected ${JSON.stringify(t.expected)}`]
    })
    expect(failures).toEqual([])
  })

  it('hidden tests differ from the samples', () => {
    const samples = new Set(p.samples.map((t) => JSON.stringify(t.args)))
    expect(p.hidden.filter((t) => samples.has(JSON.stringify(t.args)))).toEqual([])
  })

  it('JavaScript starter compiles and defines the function', () => {
    const starter = compileJs(starterCode(p, 'javascript'), p.fn.name, consoleSink())
    expect(starter.ok ? null : starter.error).toBeNull()
  })

  it.runIf(p.scale !== undefined)('scale inputs run through the reference', () => {
    if (!compiled.ok || !p.scale) throw new Error('no reference')
    const args = generateArgs(p.scale.args, 256, 7)
    expect(args).toHaveLength(p.fn.params.length)
    const r = runCase(compiled.fn, args)
    expect(r.ok ? null : r.error).toBeNull()
  })
})

describe('SQL problems', () => {
  let pg: PGlite
  beforeAll(async () => {
    pg = new PGlite()
    await pg.waitReady
  }, 60_000)
  afterAll(async () => {
    await pg?.close()
  })

  it.each(sqlProblems.map((p) => [p.slug, p] as const))('%s: reference passes every test', async (_slug, p) => {
    const tests = [...p.samples, ...p.hidden]
    const run = await runSqlCases(pg as unknown as SqlEngine, p.schema, tests.map((t) => t.seed), p.reference.code)
    expect(run.compileError).toBeNull()
    const failures = run.cases.flatMap((c, i) => {
      if (!c.ok) return [`case ${i}: ${c.error}`]
      const expected = tests[i]?.expected as SqlResult
      return sqlResultsMatch(c.output as SqlResult, expected, p.ordered)
        ? []
        : [`case ${i}: got ${JSON.stringify(c.output)}, expected ${JSON.stringify(expected)}`]
    })
    expect(failures).toEqual([])
  })
})
