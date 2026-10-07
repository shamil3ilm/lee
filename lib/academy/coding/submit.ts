import { db } from '@/lib/db/client'
import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as codingQ from '@/lib/db/queries/academyCoding'
import type { AttemptRow } from '@/lib/db/queries/academyAttempts'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { localDay } from '@/lib/academy/day'
import { evaluateCoding } from '@/lib/academy/evaluation/coding'
import { newSeed } from '@/lib/academy/evaluation/shuffle'
import { readEvaluation, type AttemptEvaluation } from '@/lib/academy/evaluation/types'
import type { Level } from '@/lib/academy/levels'
import { loadProblemCatalog, problemsContentVersion } from '@/lib/academy/problems/catalog'
import { judgePack, type JudgePack } from '@/lib/academy/problems/public'
import { languagesFor, type CodeLanguage, type Problem, type SqlResult } from '@/lib/academy/problems/schema'
import { dailyStreak } from '@/lib/academy/problems/select'
import { outputsMatch, sqlResultsMatch } from '@/lib/academy/runner/compare'
import { fitComplexity } from '@/lib/academy/runner/complexity'
import { lineMetrics, sanitizeMetrics } from '@/lib/academy/runner/quality'
import type { QualityMetrics } from '@/lib/academy/runner/quality-types'
import { judge, type JudgeCase, type Judgement } from '@/lib/academy/runner/verdict'
import { AcademyError } from '@/lib/academy/service/errors'
import { applyScoredAttempt, logResult } from '@/lib/academy/service/submit'
import { ACADEMY_ENGINE_VERSION } from '@/lib/academy/version'
import { parseRunReport, type RunReportInput } from './report'

/**
 * Submit for the coding workbench (phase 13.1), in two steps so no user
 * code ever runs on the server:
 *   1. `beginCodingSubmit` creates the attempt and returns the hidden INPUTS
 *      only (the judge pack); the browser runs them in a Web Worker.
 *   2. `finishCodingSubmit` takes the outputs, judges them against the hidden
 *      expectations (which never leave the server), fits the complexity
 *      curve, scores quality, and records everything in one transaction
 *      through the 13.0 pipeline: attempt, rating, history, XP, streak,
 *      achievements, plan tick, plus the submission, problem progress,
 *      submission retention and the daily problem.
 */

export const CODING_MODES = ['practice', 'plan', 'daily', 'mock'] as const
export type CodingMode = (typeof CODING_MODES)[number]

const MAX_ELAPSED_SEC = 3 * 3600
const MAX_OPEN_MS = 3 * 3600 * 1000

export interface BeginInput {
  slug: string
  language: CodeLanguage
  mode: CodingMode
  planItemId?: string | null
  /** When the workbench was opened (the time axis counts from here, capped). */
  openedAt?: number | null
}

export interface BeginResult {
  attemptId: string
  pack: JudgePack
}

export function problemOrThrow(slug: string): Problem {
  const problem = loadProblemCatalog().bySlug.get(slug)
  if (!problem) throw new AcademyError('not_found', 'That problem was not found.')
  return problem
}

function startedAt(now: Date, openedAt: number | null | undefined): Date {
  if (!openedAt || !Number.isFinite(openedAt)) return now
  return new Date(Math.min(now.getTime(), Math.max(now.getTime() - MAX_OPEN_MS, openedAt)))
}

export async function beginCodingSubmit(userId: string, input: BeginInput, now: Date = new Date()): Promise<BeginResult> {
  const problem = problemOrThrow(input.slug)
  if (!languagesFor(problem).includes(input.language)) throw new AcademyError('invalid', 'That language is not available for this problem.')
  const catalog = loadProblemCatalog()
  const seed = newSeed()
  const row = await attemptsQ.create(userId, {
    itemId: problem.slug,
    skillId: problem.skillId,
    format: 'coding',
    mode: input.mode,
    planDate: input.mode === 'plan' && input.planItemId ? localDay(now, await getUserTimeZone(userId)) : null,
    planItemId: input.mode === 'plan' ? (input.planItemId ?? null) : null,
    contentVersion: problemsContentVersion(catalog),
    engineVersion: ACADEMY_ENGINE_VERSION,
    seed,
    difficulty: problem.rating,
    startedAt: startedAt(now, input.openedAt),
  })
  return { attemptId: row.id, pack: judgePack(problem, seed) }
}

// --- judging -----------------------------------------------------------------

/** Samples (visible) then hidden cases, with the server-side expectations. */
export function judgeCases(problem: Problem): JudgeCase[] {
  if (problem.kind === 'sql') {
    return [
      ...problem.samples.map((t) => ({ expected: t.expected, visible: true, args: [t.seed] })),
      ...problem.hidden.map((t) => ({ expected: t.expected, visible: false })),
    ]
  }
  return [
    ...problem.samples.map((t) => ({ expected: t.expected, visible: true, args: t.args })),
    ...problem.hidden.map((t) => ({ expected: t.expected, visible: false })),
  ]
}

export function judgeReport(problem: Problem, report: Pick<RunReportInput, 'compileError' | 'timedOut' | 'cases' | 'language'>): Judgement {
  const cases = judgeCases(problem)
  const matches =
    problem.kind === 'sql'
      ? (actual: unknown, expected: unknown) => isSqlResult(actual) && sqlResultsMatch(actual, expected as SqlResult, problem.ordered)
      : (actual: unknown, expected: unknown) => outputsMatch(actual, expected, problem.compare, { looseEmpty: report.language === 'php' })
  return judge(cases, { compileError: report.compileError, timedOut: report.timedOut, cases: report.cases.slice(0, cases.length) }, matches)
}

function isSqlResult(v: unknown): v is SqlResult {
  const r = v as SqlResult | null
  return !!r && Array.isArray(r.columns) && Array.isArray(r.rows)
}

function qualityFor(report: RunReportInput): QualityMetrics | null {
  if (report.language === 'javascript' || report.language === 'typescript') return sanitizeMetrics(report.quality)
  if (report.language === 'python' || report.language === 'php') return lineMetrics(report.code, report.language)
  return null
}

/** Share of your earlier accepted runs (same problem and language) this one beat. */
export function beatsPercent(runtimeMs: number, previous: readonly number[]): number | null {
  if (previous.length === 0) return null
  const slower = previous.filter((ms) => ms > runtimeMs).length
  return Math.round((100 * slower) / previous.length)
}

// --- finishing ------------------------------------------------------------------

export interface CodingSubmitResult {
  attemptId: string
  slug: string
  judgement: Judgement
  evaluation: AttemptEvaluation
  xp: number
  levelBefore: Level
  levelAfter: Level
  earned: Array<{ id: string; name: string }>
  runtimeMs: number | null
  memoryKb: number | null
  beatsPercent: number | null
  firstSolve: boolean
  dailySolved: boolean
  alreadySubmitted: boolean
}

export interface FinishInput {
  report: unknown
  mockId?: string | null
}

function priorCodingResult(row: AttemptRow, slug: string): CodingSubmitResult {
  const evaluation = readEvaluation(row.evaluation)
  const sub = row.submission as { verdict?: string; passed?: number; total?: number } | null
  if (!evaluation || !sub) throw new AcademyError('invalid', 'This submission was already recorded.')
  return {
    attemptId: row.id,
    slug,
    judgement: {
      verdict: (sub.verdict as Judgement['verdict']) ?? 'wrong_answer',
      passed: sub.passed ?? 0,
      total: sub.total ?? 0,
      failed: null,
      runtimeMs: 0,
      message: null,
    },
    evaluation,
    xp: row.xpAwarded,
    levelBefore: 0,
    levelAfter: 0,
    earned: [],
    runtimeMs: null,
    memoryKb: null,
    beatsPercent: null,
    firstSolve: false,
    dailySolved: false,
    alreadySubmitted: true,
  }
}

async function validMockId(userId: string, mockId: string | null | undefined, slug: string, now: Date): Promise<string | null> {
  if (!mockId) return null
  const mock = await codingQ.getMock(userId, mockId)
  if (!mock || mock.finishedAt || mock.endsAt.getTime() < now.getTime()) return null
  return mock.problemSlugs.includes(slug) ? mock.id : null
}

export async function finishCodingSubmit(userId: string, attemptId: string, input: FinishInput, now: Date = new Date()): Promise<CodingSubmitResult> {
  const parsed = parseRunReport(input.report)
  if (!parsed.ok) throw new AcademyError('invalid', parsed.error)
  const report = parsed.report
  const row = await attemptsQ.get(userId, attemptId)
  if (!row || row.format !== 'coding') throw new AcademyError('not_found', 'That submission was not found.')
  if (row.submittedAt) return priorCodingResult(row, row.itemId)
  const problem = problemOrThrow(row.itemId)
  if (!languagesFor(problem).includes(report.language)) throw new AcademyError('invalid', 'That language is not available for this problem.')

  const judgement = judgeReport(problem, report)
  const accepted = judgement.verdict === 'accepted'
  const scale = problem.kind === 'function' && problem.scale && accepted && report.scale ? report.scale : null
  const fit = scale ? fitComplexity(scale) : null
  const quality = qualityFor(report)
  const [progress, timeZone, previousRuntimes] = await Promise.all([
    codingQ.getProgress(userId, problem.slug),
    getUserTimeZone(userId),
    codingQ.acceptedRuntimes(userId, problem.slug, report.language),
  ])
  const elapsedSec = Math.min(MAX_ELAPSED_SEC, Math.max(0, Math.round((now.getTime() - row.startedAt.getTime()) / 1000)))
  const evaluation = evaluateCoding({
    judgement,
    elapsedSec,
    parSec: problem.parSec,
    hintsUsed: progress?.hintsUsed ?? 0,
    priorSubmissions: progress?.submissions ?? 0,
    target: problem.complexity,
    fit,
    quality,
  })
  const today = localDay(now, timeZone)
  const daily = await codingQ.getDaily(userId, today)
  const solvesDaily = accepted && daily?.problemSlug === problem.slug && daily.solvedAt === null
  const streak = solvesDaily ? dailyStreak([...(await codingQ.solvedDailyDates(userId)), today], today) : 0
  const firstSolve = accepted && progress?.status !== 'solved'
  const mockId = await validMockId(userId, input.mockId, problem.slug, now)
  const runtimeMs = report.compileError ? null : judgement.runtimeMs
  const content = loadAcademyContent()

  const result = await db.transaction(async (tx) => {
    const applied = await applyScoredAttempt(
      userId,
      content,
      {
        row,
        difficulty: problem.rating,
        evaluation,
        submission: { language: report.language, verdict: judgement.verdict, passed: judgement.passed, total: judgement.total, runtimeMs, codeBytes: report.code.length },
        elapsedSec,
      },
      now,
      today,
      tx,
      { dailyStreak: streak, newlySolved: firstSolve },
    )
    if (!applied) return null
    await codingQ.addSubmission(
      userId,
      {
        problemSlug: problem.slug,
        attemptId: row.id,
        mockId,
        language: report.language,
        verdict: judgement.verdict,
        passed: judgement.passed,
        total: judgement.total,
        runtimeMs,
        memoryKb: report.memoryKb,
        code: report.code,
        createdAt: now,
      },
      tx,
    )
    await codingQ.recordProgress(userId, problem.slug, { accepted, runtimeMs, language: report.language, at: now }, tx)
    await codingQ.pruneSubmissions(userId, problem.slug, undefined, tx)
    if (solvesDaily) await codingQ.markDailySolved(userId, problem.slug, today, now, tx)
    return applied
  })
  if (!result) {
    const again = await attemptsQ.get(userId, attemptId)
    if (!again) throw new AcademyError('not_found', 'That submission was not found.')
    return priorCodingResult(again, problem.slug)
  }
  logResult(result, row)
  return {
    attemptId: row.id,
    slug: problem.slug,
    judgement,
    evaluation: result.evaluation,
    xp: result.xp,
    levelBefore: result.levelBefore,
    levelAfter: result.levelAfter,
    earned: result.earned,
    runtimeMs,
    memoryKb: report.memoryKb,
    beatsPercent: accepted && runtimeMs !== null ? beatsPercent(runtimeMs, previousRuntimes) : null,
    firstSolve,
    dailySolved: solvesDaily,
    alreadySubmitted: false,
  }
}
