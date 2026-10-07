import * as codingQ from '@/lib/db/queries/academyCoding'
import type { MockRow, SubmissionRow } from '@/lib/db/queries/academyCoding'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'
import type { Difficulty } from '@/lib/academy/problems/schema'
import { seedOf } from '@/lib/academy/problems/select'
import { AcademyError } from '@/lib/academy/service/errors'
import { pickerContext, pickFor } from './daily'

/**
 * Mock assessments: 2–3 adaptive problems (each one a step harder) under a
 * 60–90 minute timer. Submissions made from the mock count normally and are
 * tagged with it; the score is computed once, when the user finishes or
 * the timer runs out (on the next visit), and saved.
 */

export const MOCK_SIZES = [2, 3] as const
export const MOCK_DURATIONS = [60, 75, 90] as const

const DIFFICULTY_WEIGHT: Readonly<Record<Difficulty, number>> = { easy: 1, medium: 2, hard: 3 }
/** Expected success for problem 1, 2, 3: each one harder than the last. */
const TARGETS = [0.7, 0.55, 0.45] as const

export interface MockResult {
  slug: string
  solved: boolean
  submissions: number
  bestPassRate: number
}

export interface MockProblem {
  slug: string
  title: string
  difficulty: Difficulty
  result: MockResult
}

export interface MockView {
  id: string
  durationMin: number
  startedAt: Date
  endsAt: Date
  finishedAt: Date | null
  score: number | null
  problems: MockProblem[]
}

export async function startMock(userId: string, count: number, durationMin: number, now: Date = new Date()): Promise<string> {
  if (!(MOCK_SIZES as readonly number[]).includes(count)) throw new AcademyError('invalid', 'Pick 2 or 3 problems.')
  if (!(MOCK_DURATIONS as readonly number[]).includes(durationMin)) throw new AcademyError('invalid', 'Pick 60, 75 or 90 minutes.')
  const ctx = await pickerContext(userId, now)
  const chosen: string[] = []
  for (let i = 0; i < count; i++) {
    const pick = pickFor(ctx, {
      seed: seedOf(`${now.toISOString()}:${userId}:${i}`),
      spread: 4,
      targetSuccess: TARGETS[i] ?? 0.45,
      exclude: new Set(chosen),
      kind: 'function',
    })
    if (pick) chosen.push(pick.slug)
  }
  if (chosen.length < 2) throw new AcademyError('no_item', 'Not enough problems are available for a mock right now.')
  const row = await codingQ.createMock(userId, {
    problemSlugs: chosen,
    durationMin,
    startedAt: now,
    endsAt: new Date(now.getTime() + durationMin * 60_000),
  })
  return row.id
}

/** Per-problem results from the mock's submissions. Pure. */
export function mockResults(slugs: readonly string[], submissions: readonly Pick<SubmissionRow, 'problemSlug' | 'verdict' | 'passed' | 'total'>[]): MockResult[] {
  return slugs.map((slug) => {
    const mine = submissions.filter((s) => s.problemSlug === slug)
    const best = mine.reduce((m, s) => Math.max(m, s.total > 0 ? Math.round((100 * s.passed) / s.total) : 0), 0)
    return { slug, solved: mine.some((s) => s.verdict === 'accepted'), submissions: mine.length, bestPassRate: best }
  })
}

/** 0–100: difficulty-weighted; a solved problem counts fully, an unsolved one half its best pass rate. Pure. */
export function mockScore(results: readonly MockResult[], difficulty: (slug: string) => Difficulty): number {
  let earned = 0
  let total = 0
  for (const r of results) {
    const w = DIFFICULTY_WEIGHT[difficulty(r.slug)]
    total += w
    earned += w * (r.solved ? 1 : (0.5 * r.bestPassRate) / 100)
  }
  return total === 0 ? 0 : Math.round((100 * earned) / total)
}

function difficultyOf(slug: string): Difficulty {
  return loadProblemCatalog().bySlug.get(slug)?.difficulty ?? 'medium'
}

async function finish(userId: string, row: MockRow, now: Date): Promise<MockRow> {
  const subs = await codingQ.mockSubmissions(userId, row.id)
  const results = mockResults(row.problemSlugs, subs)
  const done = await codingQ.finishMock(userId, row.id, { finishedAt: now, score: mockScore(results, difficultyOf), results })
  return done ?? (await codingQ.getMock(userId, row.id)) ?? row
}

function toView(row: MockRow, results: readonly MockResult[]): MockView {
  const catalog = loadProblemCatalog()
  return {
    id: row.id,
    durationMin: row.durationMin,
    startedAt: row.startedAt,
    endsAt: row.endsAt,
    finishedAt: row.finishedAt,
    score: row.score,
    problems: row.problemSlugs.map((slug, i) => {
      const p = catalog.bySlug.get(slug)
      return {
        slug,
        title: p?.title ?? slug,
        difficulty: p?.difficulty ?? 'medium',
        result: results[i] ?? { slug, solved: false, submissions: 0, bestPassRate: 0 },
      }
    }),
  }
}

/** The mock as shown; a mock past its end time is finished (and scored) here. */
export async function mockView(userId: string, id: string, now: Date = new Date()): Promise<MockView | null> {
  let row = await codingQ.getMock(userId, id)
  if (!row) return null
  if (!row.finishedAt && row.endsAt.getTime() <= now.getTime()) row = await finish(userId, row, row.endsAt)
  const results = mockResults(row.problemSlugs, await codingQ.mockSubmissions(userId, row.id))
  return toView(row, results)
}

export async function finishMock(userId: string, id: string, now: Date = new Date()): Promise<MockView> {
  const row = await codingQ.getMock(userId, id)
  if (!row) throw new AcademyError('not_found', 'That mock assessment was not found.')
  if (!row.finishedAt) await finish(userId, row, now.getTime() > row.endsAt.getTime() ? row.endsAt : now)
  const view = await mockView(userId, id, now)
  if (!view) throw new AcademyError('not_found', 'That mock assessment was not found.')
  return view
}

export async function listMockViews(userId: string, now: Date = new Date()): Promise<MockView[]> {
  const rows = await codingQ.listMocks(userId)
  const out: MockView[] = []
  for (const r of rows) {
    const view = await mockView(userId, r.id, now)
    if (view) out.push(view)
  }
  return out
}
