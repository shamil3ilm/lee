import { describe, expect, it } from 'vitest'
import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as codingQ from '@/lib/db/queries/academyCoding'
import * as ratingsQ from '@/lib/db/queries/academyRatings'
import * as stateQ from '@/lib/db/queries/academyState'
import { dailyProblem } from '@/lib/academy/coding/daily'
import { finishMock, mockView, startMock } from '@/lib/academy/coding/mock'
import { beginCodingSubmit, finishCodingSubmit } from '@/lib/academy/coding/submit'
import { codingStats } from '@/lib/academy/coding/stats'
import { revealHint, unlockSolution, workbenchView } from '@/lib/academy/coding/workbench'
import type { RunReportInput } from '@/lib/academy/coding/report'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'
import type { JudgePack } from '@/lib/academy/problems/public'
import type { FunctionProblem } from '@/lib/academy/problems/schema'
import { compileJs, consoleSink, runCase } from '@/lib/academy/runner/js-harness'
import { getTodayPlan } from '@/lib/academy/service/plan'
import { startPlanItem } from '@/lib/academy/service/start'
import { pruneCodingSubmissions } from '@/lib/db/retention/academy'
import { makeUser } from '../factories'

// Synthetic data only. The "browser" here is the same JS harness the runner
// worker uses, run in Node on the reference solution.

const catalog = loadProblemCatalog()
const NOW = new Date('2026-10-07T09:00:00Z')
const at = (sec: number) => new Date(NOW.getTime() + sec * 1000)

function fnProblem(slug: string): FunctionProblem {
  const p = catalog.bySlug.get(slug)
  if (!p || p.kind !== 'function') throw new Error(`no function problem ${slug}`)
  return p
}

/** What the workbench sends back after running samples + the pack's hidden inputs. */
function report(p: FunctionProblem, pack: JudgePack, code: string, scale: RunReportInput['scale'] = null): RunReportInput {
  if (pack.kind !== 'function') throw new Error('function pack expected')
  const compiled = compileJs(code, p.fn.name, consoleSink())
  if (!compiled.ok) return { language: 'javascript', code, compileError: compiled.error, timedOut: false, cases: [], scale: null, quality: null, memoryKb: null }
  const inputs = [...p.samples.map((s) => s.args), ...pack.hiddenArgs]
  return {
    language: 'javascript',
    code,
    compileError: null,
    timedOut: false,
    cases: inputs.map((args) => runCase(compiled.fn, args)),
    scale,
    quality: { maxFnLength: 9, nesting: 2, cyclomatic: 3, namingIssues: 0 },
    memoryKb: 2048,
  }
}

const LINEAR = [256, 512, 1024, 2048, 4096, 8192].map((n) => ({ n, ms: n * 0.0001 }))

describe('coding workbench: submit → attempt → rating → progress', () => {
  it('begin hands out hidden inputs only; finish judges on the server and records everything once', async () => {
    const u = await makeUser()
    const p = fnProblem('refund-pair')
    const begun = await beginCodingSubmit(u.id, { slug: p.slug, language: 'javascript', mode: 'practice', openedAt: NOW.getTime() - 300_000 }, NOW)
    // The pack never carries expected outputs or the reference solution.
    const packJson = JSON.stringify(begun.pack)
    expect(packJson).not.toContain(p.reference.code.slice(0, 40))
    expect(packJson).not.toContain('expected')
    if (begun.pack.kind !== 'function') throw new Error('kind')
    expect(begun.pack.hiddenArgs).toHaveLength(p.hidden.length)

    const ratingBefore = await ratingsQ.get(u.id, p.skillId)
    const result = await finishCodingSubmit(u.id, begun.attemptId, { report: report(p, begun.pack, p.reference.code, LINEAR) }, at(10))
    expect(result.judgement).toMatchObject({ verdict: 'accepted', passed: p.samples.length + p.hidden.length, failed: null })
    expect(result.evaluation.format).toBe('coding')
    expect(result.evaluation.complexity).toMatchObject({ status: 'scored', score: 100, detail: { measuredTime: 'O(n)', targetTime: 'O(n)' } })
    expect(result.evaluation.quality.status).toBe('scored')
    expect(result.evaluation.composite).toBeGreaterThan(80)
    expect(result.xp).toBeGreaterThan(0)
    expect(result.firstSolve).toBe(true)
    expect(result.earned.map((a) => a.id)).toContain('first-accepted')

    const ratingAfter = await ratingsQ.get(u.id, p.skillId)
    expect(ratingAfter!.rating).toBeGreaterThan(ratingBefore?.rating ?? 1400)
    const row = await attemptsQ.get(u.id, begun.attemptId)
    expect(row).toMatchObject({ format: 'coding', itemId: p.slug, contentVersion: `academy-problems@${catalog.packVersion}` })
    expect(row!.submission).toMatchObject({ language: 'javascript', verdict: 'accepted' })

    const progress = await codingQ.getProgress(u.id, p.slug)
    expect(progress).toMatchObject({ status: 'solved', submissions: 1, accepted: 1, bestLanguage: 'javascript' })
    expect((await codingQ.listSubmissions(u.id, p.slug))[0]).toMatchObject({ verdict: 'accepted', language: 'javascript' })

    // A replayed finish is counted once.
    const again = await finishCodingSubmit(u.id, begun.attemptId, { report: report(p, begun.pack, p.reference.code) }, at(20))
    expect(again.alreadySubmitted).toBe(true)
    expect((await codingQ.getProgress(u.id, p.slug))!.submissions).toBe(1)
    expect((await stateQ.ensure(u.id)).xp).toBe(result.xp)
  })

  it('a wrong hidden answer is Wrong Answer with the hidden case number only; ratings move down', async () => {
    const u = await makeUser()
    const p = fnProblem('refund-pair')
    const begun = await beginCodingSubmit(u.id, { slug: p.slug, language: 'javascript', mode: 'practice' }, NOW)
    // Correct on the samples, wrong on everything else.
    const sampleKeys = p.samples.map((s) => JSON.stringify(s.args))
    const code = `function refundPair(amounts, target) {
  const known = ${JSON.stringify(Object.fromEntries(p.samples.map((s, i) => [sampleKeys[i], s.expected])))}
  return known[JSON.stringify([amounts, target])] || [-1, -1]
}`
    const result = await finishCodingSubmit(u.id, begun.attemptId, { report: report(p, begun.pack, code) }, at(30))
    expect(result.judgement.verdict).toBe('wrong_answer')
    expect(result.judgement.failed).toEqual({ kind: 'hidden', index: 1, errorType: null })
    expect(result.judgement.passed).toBe(p.samples.length)
    expect(JSON.stringify(result)).not.toContain(JSON.stringify(p.hidden[0]!.args))
    expect(result.evaluation.outcome).toBeLessThan(1)
    expect(result.evaluation.complexity.status).toBe('n/a')
    expect((await codingQ.getProgress(u.id, p.slug))).toMatchObject({ status: 'attempted', submissions: 1, accepted: 0 })
    expect((await ratingsQ.get(u.id, p.skillId))!.rating).toBeLessThan(1400)
  })

  it('compile errors and bad reports are handled without counting a malformed request', async () => {
    const u = await makeUser()
    const p = fnProblem('refund-pair')
    const begun = await beginCodingSubmit(u.id, { slug: p.slug, language: 'javascript', mode: 'practice' }, NOW)
    await expect(finishCodingSubmit(u.id, begun.attemptId, { report: { nope: true } }, at(5))).rejects.toThrow(/could not be read/)
    const ce = await finishCodingSubmit(u.id, begun.attemptId, { report: report(p, begun.pack, 'function refundPair( {') }, at(5))
    expect(ce.judgement.verdict).toBe('compile_error')
    expect(ce.evaluation.composite).toBe(0)
  })

  it('the workbench view never carries hidden tests or the reference until solved or given up', async () => {
    const u = await makeUser()
    const p = fnProblem('ledger-reconciliation')
    const view = await workbenchView(u.id, p.slug)
    const json = JSON.stringify(view)
    expect(json).not.toContain(p.reference.code.slice(0, 40))
    for (const t of p.hidden) expect(json).not.toContain(JSON.stringify(t.args))
    expect(view!.hints).toEqual([])
    expect(view!.solution).toBeNull()

    expect(await revealHint(u.id, p.slug)).toEqual([p.hints[0]])
    expect(await revealHint(u.id, p.slug)).toEqual(p.hints.slice(0, 2))
    expect((await codingQ.getProgress(u.id, p.slug))!.hintsUsed).toBe(2)
    const solution = await unlockSolution(u.id, p.slug, NOW)
    expect(solution.code).toBe(p.reference.code)
    const after = await workbenchView(u.id, p.slug)
    expect(after!.gaveUp).toBe(true)
    expect(after!.solution?.code).toBe(p.reference.code)
    expect(after!.status).toBe('todo')
  })

  it('keeps the latest 20 submissions per problem plus the fastest accepted one', async () => {
    const u = await makeUser()
    const slug = 'refund-pair'
    await codingQ.addSubmission(u.id, { problemSlug: slug, language: 'javascript', verdict: 'accepted', passed: 8, total: 8, runtimeMs: 1, code: 'fast', createdAt: at(0) })
    for (let i = 1; i <= 25; i++) {
      await codingQ.addSubmission(u.id, { problemSlug: slug, language: 'javascript', verdict: 'wrong_answer', passed: 1, total: 8, runtimeMs: 9, code: `try ${i}`, createdAt: at(i) })
    }
    // The nightly retention step finds problems over the cap and prunes them.
    const deleted = await pruneCodingSubmissions({ userId: u.id })
    expect(deleted).toBe(5)
    const left = await codingQ.listSubmissions(u.id, slug, 100)
    expect(left).toHaveLength(21)
    expect(left.map((s) => s.code)).toContain('fast')
    expect(left[0]!.code).toBe('try 25')
    expect(codingQ.capCode('x'.repeat(20_000)).length).toBeLessThan(16_384)
  })
})

describe('daily problem, plan item, mock assessment and stats', () => {
  it('the daily problem is fixed for the day, appears in the plan and counts the daily streak', async () => {
    const u = await makeUser()
    const daily = await dailyProblem(u.id, NOW)
    expect(daily).not.toBeNull()
    expect((await dailyProblem(u.id, at(3600)))!.slug).toBe(daily!.slug)

    // A daily problem takes its par time (10–30 min): give the plan room for it.
    await stateQ.ensure(u.id)
    await stateQ.update(u.id, { timeBudgetMin: 90, mode: 'deep' })
    const { items } = await getTodayPlan(u.id, NOW)
    const coding = items.find((i) => i.kind === 'coding')
    expect(coding?.itemId).toBe(daily!.slug)
    const { href } = await startPlanItem(u.id, coding!.id, NOW)
    expect(href).toBe(`/playground/problems/${daily!.slug}?plan=${encodeURIComponent(coding!.id)}`)

    const p = catalog.bySlug.get(daily!.slug)!
    if (p.kind !== 'function') return // the picker prefers function problems for new users; SQL is covered by the content gate
    const begun = await beginCodingSubmit(u.id, { slug: p.slug, language: 'javascript', mode: 'plan', planItemId: coding!.id }, NOW)
    const result = await finishCodingSubmit(u.id, begun.attemptId, { report: report(p, begun.pack, p.reference.code) }, at(60))
    expect(result.judgement.verdict).toBe('accepted')
    expect(result.dailySolved).toBe(true)
    const after = await dailyProblem(u.id, at(120))
    expect(after).toMatchObject({ solved: true, streak: 1 })
    const plan = await getTodayPlan(u.id, at(120))
    expect(plan.items.find((i) => i.kind === 'coding')?.status).toBe('done')
  })

  it('a mock assessment scores its submissions when finished', async () => {
    const u = await makeUser()
    const id = await startMock(u.id, 2, 60, NOW)
    const view = await mockView(u.id, id, at(10))
    expect(view!.problems).toHaveLength(2)
    expect(view!.finishedAt).toBeNull()
    const first = fnProblem(view!.problems[0]!.slug)
    const begun = await beginCodingSubmit(u.id, { slug: first.slug, language: 'javascript', mode: 'mock' }, at(20))
    await finishCodingSubmit(u.id, begun.attemptId, { report: report(first, begun.pack, first.reference.code), mockId: id }, at(600))
    const done = await finishMock(u.id, id, at(900))
    expect(done.finishedAt).not.toBeNull()
    expect(done.problems[0]!.result).toMatchObject({ solved: true, submissions: 1, bestPassRate: 100 })
    expect(done.score).toBeGreaterThan(0)
    expect(done.score).toBeLessThan(100)
    // Finishing is idempotent.
    expect((await finishMock(u.id, id, at(1200))).score).toBe(done.score)
  })

  it('stats count coding attempts per day and language', async () => {
    const u = await makeUser()
    const p = fnProblem('split-bill-cents')
    const begun = await beginCodingSubmit(u.id, { slug: p.slug, language: 'javascript', mode: 'practice' }, NOW)
    await finishCodingSubmit(u.id, begun.attemptId, { report: report(p, begun.pack, p.reference.code) }, at(30))
    const stats = await codingStats(u.id, at(60))
    expect(stats.languages).toEqual([{ language: 'javascript', count: 1 }])
    expect(stats.activeDays).toBe(1)
    expect(stats.summary.solved[p.difficulty]).toBe(1)
    expect(stats.heatmap.at(-1)?.count).toBe(1)
  })
})
