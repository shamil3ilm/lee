'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import { logger } from '@/lib/logger'
import { pickerContext, pickFor } from '@/lib/academy/coding/daily'
import { finishMock, startMock } from '@/lib/academy/coding/mock'
import { beginCodingSubmit, CODING_MODES, finishCodingSubmit, type BeginResult, type CodingSubmitResult } from '@/lib/academy/coding/submit'
import { assertSlug, revealHint, submissionsFor, unlockSolution, type SubmissionView } from '@/lib/academy/coding/workbench'
import type { SolutionView } from '@/lib/academy/problems/public'
import { CODE_LANGUAGES } from '@/lib/academy/problems/schema'
import { seedOf } from '@/lib/academy/problems/select'
import { AcademyError } from '@/lib/academy/service/errors'

/**
 * Server actions for the coding workbench. No user code runs here: Submit
 * hands the browser the hidden inputs (begin), then judges the outputs the
 * browser's runner produced (finish). Errors map to friendly messages; an
 * unknown error is logged and never forwarded.
 */

type Result<T = object> = ({ success: true } & T) | { error: string }

function fail(what: string, err: unknown): { error: string } {
  if (err instanceof AcademyError) return { error: err.message }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: 'Something went wrong. Please try again.' }
}

const beginSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/),
  language: z.enum(CODE_LANGUAGES),
  mode: z.enum(CODING_MODES).default('practice'),
  planItemId: z.string().max(120).nullish(),
  openedAt: z.number().int().positive().nullish(),
})

export async function beginSubmitAction(input: unknown): Promise<Result<BeginResult>> {
  try {
    const userId = await requireUserId()
    const parsed = beginSchema.safeParse(input)
    if (!parsed.success) return { error: 'That submission could not be started.' }
    const r = await beginCodingSubmit(userId, parsed.data)
    return { success: true, ...r }
  } catch (err) {
    return fail('beginSubmit', err)
  }
}

export async function finishSubmitAction(
  attemptId: unknown,
  report: unknown,
  mockId?: unknown,
): Promise<Result<{ result: CodingSubmitResult; submissions: SubmissionView[] }>> {
  try {
    const userId = await requireUserId()
    const id = z.string().uuid().safeParse(attemptId)
    if (!id.success) return { error: 'That submission was not found.' }
    const mock = z.string().uuid().nullish().safeParse(mockId)
    const result = await finishCodingSubmit(userId, id.data, { report, mockId: mock.success ? mock.data : null })
    const submissions = await submissionsFor(userId, result.slug)
    revalidatePath('/playground')
    revalidatePath('/playground/problems')
    revalidatePath('/playground/history')
    return { success: true, result, submissions }
  } catch (err) {
    return fail('finishSubmit', err)
  }
}

export async function revealHintAction(slug: unknown): Promise<Result<{ hints: string[] }>> {
  try {
    const userId = await requireUserId()
    const hints = await revealHint(userId, assertSlug(slug))
    return { success: true, hints }
  } catch (err) {
    return fail('revealHint', err)
  }
}

export async function unlockSolutionAction(slug: unknown): Promise<Result<{ solution: SolutionView }>> {
  try {
    const userId = await requireUserId()
    const solution = await unlockSolution(userId, assertSlug(slug))
    revalidatePath('/playground/problems')
    return { success: true, solution }
  } catch (err) {
    return fail('unlockSolution', err)
  }
}

/** "Pick one for me": the adaptive picker, varied among the best few. */
export async function pickProblemAction(): Promise<Result<{ href: string }>> {
  try {
    const userId = await requireUserId()
    const ctx = await pickerContext(userId)
    const pick = pickFor(ctx, { seed: seedOf(`${Date.now()}:${userId}`), spread: 5, exclude: ctx.solved.size < 40 ? ctx.solved : undefined })
    if (!pick) return { error: 'No problem matches right now.' }
    return { success: true, href: `/playground/problems/${pick.slug}` }
  } catch (err) {
    return fail('pickProblem', err)
  }
}

const mockSchema = z.object({ count: z.coerce.number().int(), durationMin: z.coerce.number().int() })

export async function startMockAction(input: unknown): Promise<Result<{ href: string }>> {
  try {
    const userId = await requireUserId()
    const parsed = mockSchema.safeParse(input)
    if (!parsed.success) return { error: 'Pick the number of problems and the time.' }
    const id = await startMock(userId, parsed.data.count, parsed.data.durationMin)
    revalidatePath('/playground/problems/mock')
    return { success: true, href: `/playground/problems/mock/${id}` }
  } catch (err) {
    return fail('startMock', err)
  }
}

export async function finishMockAction(id: unknown): Promise<Result<{ score: number | null }>> {
  try {
    const userId = await requireUserId()
    const mockId = z.string().uuid().safeParse(id)
    if (!mockId.success) return { error: 'That mock assessment was not found.' }
    const view = await finishMock(userId, mockId.data)
    revalidatePath('/playground/problems/mock')
    revalidatePath(`/playground/problems/mock/${mockId.data}`)
    return { success: true, score: view.score }
  } catch (err) {
    return fail('finishMock', err)
  }
}
