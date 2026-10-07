// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { argsToText, parseCustomArgs } from '@/lib/academy/coding/custom-input'
import { clearDraft, loadDraft, loadLanguage, openedAt, saveDraft, saveLanguage } from '@/lib/academy/coding/drafts'
import { filterHref, filterProblems, parseFilters, summarize, type ProblemFilters } from '@/lib/academy/coding/list'
import { mockResults, mockScore } from '@/lib/academy/coding/mock'
import { heatmapDays, longestRun } from '@/lib/academy/coding/stats'
import { beatsPercent, judgeReport } from '@/lib/academy/coding/submit'
import { evaluateCoding } from '@/lib/academy/evaluation/coding'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'
import { dailyStreak, pickProblem, seedOf } from '@/lib/academy/problems/select'
import { fnNameFor, snakeCase, starterCode } from '@/lib/academy/problems/starter'
import { phpFatal, phpSource, readMarked } from '@/lib/academy/runner/php-harness'
import type { Judgement } from '@/lib/academy/runner/verdict'
import type { ProgressRow } from '@/lib/db/queries/academyCoding'

const catalog = loadProblemCatalog()
const progressRow = (slug: string, over: Partial<ProgressRow> = {}): ProgressRow => ({
  userId: 'u',
  problemSlug: slug,
  status: 'attempted',
  submissions: 2,
  accepted: 1,
  bestRuntimeMs: 4,
  bestLanguage: 'javascript',
  hintsUsed: 0,
  gaveUpAt: null,
  firstSolvedAt: null,
  lastSubmittedAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...over,
})

describe('problem list filters', () => {
  const base: ProblemFilters = { sort: 'default', page: 1 }

  it('parses search params, dropping unknown values', () => {
    expect(parseFilters({ difficulty: 'hard', topic: 'graphs', status: 'nope', page: '0', q: '  ledger ', sort: 'acceptance' })).toEqual({
      difficulty: 'hard',
      topic: 'graphs',
      role: undefined,
      status: undefined,
      language: undefined,
      q: 'ledger',
      sort: 'acceptance',
      page: 1,
    })
  })

  it('filters by difficulty, topic, role, language, status and search', () => {
    const all = filterProblems(catalog.problems, [], base)
    expect(all.total).toBe(catalog.problems.length)
    const hard = filterProblems(catalog.problems, [], { ...base, difficulty: 'hard' })
    expect(hard.rows.every((r) => r.difficulty === 'hard')).toBe(true)
    const sql = filterProblems(catalog.problems, [], { ...base, language: 'sql' })
    expect(sql.rows.every((r) => r.languages.includes('sql'))).toBe(true)
    const payments = filterProblems(catalog.problems, [], { ...base, role: 'payments' })
    expect(payments.rows.every((r) => r.roles.includes('payments'))).toBe(true)
    const found = filterProblems(catalog.problems, [], { ...base, q: 'REFUND PAIR' })
    expect(found.rows.map((r) => r.slug)).toContain('refund-pair')
    const solved = filterProblems(catalog.problems, [progressRow('refund-pair', { status: 'solved' })], { ...base, status: 'solved' })
    expect(solved.rows.map((r) => r.slug)).toEqual(['refund-pair'])
    const todo = filterProblems(catalog.problems, [progressRow('refund-pair')], { ...base, status: 'todo' })
    expect(todo.rows.map((r) => r.slug)).not.toContain('refund-pair')
  })

  it('paginates 20 per page and sorts', () => {
    const p2 = filterProblems(catalog.problems, [], { ...base, page: 2 })
    expect(p2.rows.length).toBeGreaterThan(0)
    expect(p2.page).toBe(2)
    expect(filterProblems(catalog.problems, [], { ...base, page: 99 }).page).toBe(p2.pages)
    const byDiff = filterProblems(catalog.problems, [], { ...base, sort: 'difficulty' }).rows
    expect(byDiff[0]!.difficulty).toBe('easy')
    const byAcc = filterProblems(catalog.problems, [progressRow('lru-cache-ops', { accepted: 2, submissions: 2 })], { ...base, sort: 'acceptance' })
    expect(byAcc.rows[0]!.slug).toBe('lru-cache-ops')
    expect(byAcc.rows[0]!.acceptance).toBe(100)
  })

  it('summarises solved per difficulty and the acceptance rate', () => {
    const s = summarize(catalog.problems, [progressRow('refund-pair', { status: 'solved', submissions: 3, accepted: 1 }), progressRow('ghost')])
    expect(s.solved.easy).toBe(1)
    expect(s.submissions).toBe(3)
    expect(s.acceptance).toBe(33)
    expect(s.totals.easy + s.totals.medium + s.totals.hard).toBe(catalog.problems.length)
  })

  it('builds filter links that reset the page', () => {
    expect(filterHref({ ...base, page: 3, topic: 'dp' }, { difficulty: 'easy' })).toBe('/playground/problems?topic=dp&difficulty=easy')
    expect(filterHref(base, {})).toBe('/playground/problems')
  })
})

describe('adaptive picker and daily streak', () => {
  const problems = [
    { slug: 'easy', skillId: 's', rating: 1100, kind: 'function' as const },
    { slug: 'match', skillId: 's', rating: 1250, kind: 'function' as const },
    { slug: 'hard', skillId: 's', rating: 1900, kind: 'function' as const },
    { slug: 'query', skillId: 'q', rating: 1250, kind: 'sql' as const },
  ]
  const ratings = new Map([['s', 1400]])

  it('picks near 70% expected success, preferring unsolved and not recent', () => {
    expect(pickProblem(problems, { ratings, solved: new Set(), recent: [], seed: 1, kind: 'function' })?.slug).toBe('match')
    expect(pickProblem(problems, { ratings, solved: new Set(['match']), recent: [], seed: 1, kind: 'function' })?.slug).toBe('easy')
    expect(pickProblem(problems, { ratings, solved: new Set(), recent: ['match'], seed: 1, kind: 'function' })?.slug).toBe('easy')
    expect(pickProblem(problems, { ratings, solved: new Set(), recent: [], seed: 1, kind: 'sql' })?.slug).toBe('query')
    expect(pickProblem(problems, { ratings, solved: new Set(), recent: [], seed: 1, exclude: new Set(problems.map((p) => p.slug)) })).toBeNull()
  })

  it('spreads random picks over the best few, deterministically per seed', () => {
    const picks = new Set(Array.from({ length: 30 }, (_, i) => pickProblem(problems, { ratings, solved: new Set(), recent: [], seed: i, spread: 3 })?.slug))
    expect(picks.size).toBeGreaterThan(1)
    expect(pickProblem(problems, { ratings, solved: new Set(), recent: [], seed: 5, spread: 3 })).toEqual(
      pickProblem(problems, { ratings, solved: new Set(), recent: [], seed: 5, spread: 3 }),
    )
    expect(seedOf('a')).not.toBe(seedOf('b'))
  })

  it('counts consecutive solved days ending today or yesterday', () => {
    expect(dailyStreak(['2026-10-07', '2026-10-06', '2026-10-04'], '2026-10-07')).toBe(2)
    expect(dailyStreak(['2026-10-06', '2026-10-05'], '2026-10-07')).toBe(2)
    expect(dailyStreak(['2026-10-05'], '2026-10-07')).toBe(0)
    expect(longestRun(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'])).toBe(3)
    expect(longestRun([])).toBe(0)
  })
})

describe('mock scoring', () => {
  it('weights by difficulty; unsolved counts half its best pass rate', () => {
    const results = mockResults(
      ['a', 'b'],
      [
        { problemSlug: 'a', verdict: 'wrong_answer', passed: 2, total: 4 },
        { problemSlug: 'a', verdict: 'accepted', passed: 4, total: 4 },
        { problemSlug: 'b', verdict: 'wrong_answer', passed: 5, total: 10 },
      ],
    )
    expect(results).toEqual([
      { slug: 'a', solved: true, submissions: 2, bestPassRate: 100 },
      { slug: 'b', solved: false, submissions: 1, bestPassRate: 50 },
    ])
    // a easy (1) solved = 1; b hard (3) at 25% = 0.75 → 1.75 / 4 = 44
    expect(mockScore(results, (s) => (s === 'a' ? 'easy' : 'hard'))).toBe(44)
    expect(mockScore([], () => 'easy')).toBe(0)
  })
})

describe('stats helpers', () => {
  it('lays out the calendar from a Sunday through today', () => {
    const days = heatmapDays('2026-10-07', new Map([['2026-10-07', 3]]), 2)
    expect(days[0]!.day).toBe('2026-09-27')
    expect(new Date(`${days[0]!.day}T00:00:00Z`).getUTCDay()).toBe(0)
    expect(days.at(-1)).toEqual({ day: '2026-10-07', count: 3 })
    expect(days).toHaveLength(11)
  })
})

describe('starter code, custom input and PHP helpers', () => {
  it('generates starters per language from the signature', () => {
    const p = catalog.bySlug.get('refund-pair')!
    expect(starterCode(p, 'javascript')).toContain('function refundPair(amounts, target)')
    expect(starterCode(p, 'typescript')).toContain('function refundPair(amounts: number[], target: number): number[]')
    expect(starterCode(p, 'python')).toContain('def refund_pair(amounts: list[int], target: int) -> list[int]:')
    expect(starterCode(p, 'php')).toContain('function refundPair(array $amounts, int $target): array')
    expect(snakeCase('topKFrequent')).toBe('top_k_frequent')
    if (p.kind === 'function') expect(fnNameFor(p.fn, 'python')).toBe('refund_pair')
    expect(starterCode(catalog.bySlug.get('merchant-volume')!, 'sql')).toContain('SELECT')
  })

  it('parses one JSON value per parameter line', () => {
    const fn = { params: [{ name: 'amounts', type: 'int[]' as const }, { name: 'target', type: 'int' as const }] }
    expect(parseCustomArgs('[1,2]\n\n3', fn)).toEqual({ ok: true, args: [[1, 2], 3] })
    expect(parseCustomArgs('[1,2]', fn).ok).toBe(false)
    const bad = parseCustomArgs('[1,2]\nnope', fn)
    expect(bad.ok ? '' : bad.error).toMatch(/Line 2 \(target\)/)
    expect(argsToText([[1, 2], 'a'])).toBe('[1,2]\n"a"')
  })

  it('wraps PHP sources and reads marked results', () => {
    expect(phpSource('function f() {}')).toBe('<?php\nfunction f() {}')
    expect(phpSource('<?php\nfunction f() {}')).toBe('<?php\nfunction f() {}')
    expect(readMarked<{ a: number }>('noise\n__LEE_RESULT__{"a":1}')).toEqual({ a: 1 })
    expect(readMarked('no marker')).toBeNull()
    expect(phpFatal('PHP Fatal error:  Uncaught Error in /tmp/x.php:1\nmore')).toBe('Fatal error:  Uncaught Error in /tmp/x.php:1')
  })
})

describe('drafts in localStorage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('saves and loads per problem and language', () => {
    expect(saveDraft('p', 'python', 'print(1)')).toBe(true)
    expect(loadDraft('p', 'python')).toBe('print(1)')
    expect(loadDraft('p', 'php')).toBeNull()
    clearDraft('p', 'python')
    expect(loadDraft('p', 'python')).toBeNull()
    saveLanguage('php')
    expect(loadLanguage()).toBe('php')
    const first = openedAt('p', 1000)
    expect(openedAt('p', 5000)).toBe(first)
  })

  it('survives storage that throws', () => {
    // Private windows and blocked site data: even reading window.localStorage throws.
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadDraft('p', 'python')).toBeNull()
    expect(saveDraft('p', 'python', 'x')).toBe(false)
    expect(loadLanguage()).toBeNull()
    expect(() => saveLanguage('sql')).not.toThrow()
    expect(openedAt('q', 42)).toBe(42)
  })
})

describe('server-side judging and the coding evaluator', () => {
  const p = catalog.bySlug.get('refund-pair')!
  const all = p.kind === 'function' ? [...p.samples, ...p.hidden] : []

  it('judges a report against hidden expectations', () => {
    const ok = judgeReport(p, { language: 'javascript', compileError: null, timedOut: false, cases: all.map((t) => ({ ok: true, output: t.expected, ms: 1 })) })
    expect(ok.verdict).toBe('accepted')
    const tle = judgeReport(p, { language: 'javascript', compileError: null, timedOut: true, cases: all.slice(0, 2).map((t) => ({ ok: true, output: t.expected, ms: 1 })) })
    expect(tle).toMatchObject({ verdict: 'time_limit', failed: { kind: 'hidden', index: 1 } })
    // Extra cases beyond the test count are ignored.
    const extra = judgeReport(p, { language: 'javascript', compileError: null, timedOut: false, cases: [...all, ...all].map((t) => ({ ok: true, output: t.expected, ms: 1 })) })
    expect(extra.total).toBe(all.length)
  })

  it('scores accepted, partial and compile-error submissions', () => {
    const judgement = (verdict: Judgement['verdict'], passed: number): Judgement => ({ verdict, passed, total: 10, failed: null, runtimeMs: 5, message: null })
    const base = { elapsedSec: 300, parSec: 600, hintsUsed: 0, priorSubmissions: 0, target: { time: 'O(n)' as const, space: 'O(n)' as const }, fit: null, quality: null }
    const accepted = evaluateCoding({ ...base, judgement: judgement('accepted', 10), fit: { label: 'O(n^2)', residual: 0, slope: 2 } })
    expect(accepted.outcome).toBe(1)
    expect(accepted.complexity).toMatchObject({ status: 'scored', score: 25 })
    expect(accepted.improvements.join(' ')).toMatch(/O\(n\^2\).*O\(n\)/)
    expect(accepted.quality.status).toBe('n/a')
    const partial = evaluateCoding({ ...base, judgement: judgement('wrong_answer', 5), hintsUsed: 2, priorSubmissions: 3 })
    expect(partial.composite).toBe(15)
    expect(partial.outcome).toBe(0.2)
    expect(partial.effectiveness).toMatchObject({ score: 30 })
    const ce = evaluateCoding({ ...base, judgement: judgement('compile_error', 0) })
    expect(ce.composite).toBe(0)
    expect(ce.improvements[0]).toMatch(/compile error/)
  })

  it('grades a solution too slow to time as worse than its target, never skipped', () => {
    const j: Judgement = { verdict: 'accepted', passed: 8, total: 8, failed: null, runtimeMs: 5, message: null }
    const base = { judgement: j, elapsedSec: 60, parSec: 600, hintsUsed: 0, priorSubmissions: 0, target: { time: 'O(n)' as const, space: 'O(n)' as const }, quality: null, visibleCount: 2 }
    const slow = evaluateCoding({ ...base, fit: null, tooSlow: true })
    expect(slow.complexity).toMatchObject({ status: 'scored', score: 25, detail: { measuredTime: 'too slow to time' } })
    expect(slow.effectiveness).toMatchObject({ detail: { approachOptimal: false } })
    expect(slow.correctness).toMatchObject({ detail: { passed: 8, hiddenPassed: 6 } })
    const fast = evaluateCoding({ ...base, fit: { label: 'O(n)', residual: 0, slope: 1 } })
    expect(fast.composite).toBeGreaterThan(slow.composite)
  })

  it('reports how many earlier accepted runs this one beat', () => {
    expect(beatsPercent(5, [10, 4, 6, 5])).toBe(50)
    expect(beatsPercent(5, [])).toBeNull()
  })
})
