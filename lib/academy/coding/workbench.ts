import * as codingQ from '@/lib/db/queries/academyCoding'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { solutionView, toPublicProblem, type PublicProblem, type SolutionView } from '@/lib/academy/problems/public'
import { AcademyError } from '@/lib/academy/service/errors'
import type { Verdict } from '@/lib/academy/runner/verdict'
import { statusOf, type ProblemStatus } from './list'
import { problemOrThrow } from './submit'

/**
 * The workbench read model: the public problem (no hidden tests, no
 * reference), the hints revealed so far, the user's submissions, and the
 * solution only once it is unlocked (accepted or given up). Hints are
 * revealed one at a time; each reveal is recorded.
 */

export interface SubmissionView {
  id: string
  language: string
  verdict: Verdict
  passed: number
  total: number
  runtimeMs: number | null
  memoryKb: number | null
  code: string
  createdAt: Date
}

export interface WorkbenchView {
  problem: PublicProblem
  skillName: string
  status: ProblemStatus
  hints: string[]
  submissions: SubmissionView[]
  solution: SolutionView | null
  gaveUp: boolean
  bestRuntimeMs: number | null
}

function toSubmissionView(r: codingQ.SubmissionRow): SubmissionView {
  return {
    id: r.id,
    language: r.language,
    verdict: r.verdict as Verdict,
    passed: r.passed,
    total: r.total,
    runtimeMs: r.runtimeMs,
    memoryKb: r.memoryKb,
    code: r.code,
    createdAt: r.createdAt,
  }
}

export async function workbenchView(userId: string, slug: string): Promise<WorkbenchView | null> {
  const problem = (() => {
    try {
      return problemOrThrow(slug)
    } catch {
      return null
    }
  })()
  if (!problem) return null
  const [progress, submissions] = await Promise.all([codingQ.getProgress(userId, slug), codingQ.listSubmissions(userId, slug)])
  const status = statusOf(progress ?? undefined)
  const unlocked = status === 'solved' || !!progress?.gaveUpAt
  const content = loadAcademyContent()
  return {
    problem: toPublicProblem(problem),
    skillName: content.graph.byId.get(problem.skillId)?.name ?? problem.skillId,
    status,
    hints: problem.hints.slice(0, progress?.hintsUsed ?? 0),
    submissions: submissions.map(toSubmissionView),
    solution: unlocked ? solutionView(problem) : null,
    gaveUp: !!progress?.gaveUpAt,
    bestRuntimeMs: progress?.bestRuntimeMs ?? null,
  }
}

/** Reveal the next hint (recorded once); returns every hint revealed so far. */
export async function revealHint(userId: string, slug: string): Promise<string[]> {
  const problem = problemOrThrow(slug)
  const progress = await codingQ.getProgress(userId, slug)
  const next = Math.min(problem.hints.length, (progress?.hintsUsed ?? 0) + 1)
  const used = await codingQ.recordHints(userId, slug, next)
  return problem.hints.slice(0, used)
}

/** The solution: free after solving; before that it counts as giving up. */
export async function unlockSolution(userId: string, slug: string, now: Date = new Date()): Promise<SolutionView> {
  const problem = problemOrThrow(slug)
  const progress = await codingQ.getProgress(userId, slug)
  if (progress?.status !== 'solved') await codingQ.recordGaveUp(userId, slug, now)
  return solutionView(problem)
}

export async function submissionsFor(userId: string, slug: string): Promise<SubmissionView[]> {
  problemOrThrow(slug)
  return (await codingQ.listSubmissions(userId, slug)).map(toSubmissionView)
}

export function assertSlug(slug: unknown): string {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug)) throw new AcademyError('not_found', 'That problem was not found.')
  return slug
}
