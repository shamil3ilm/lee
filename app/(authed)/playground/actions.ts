'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId } from '@/lib/auth/require-session'
import * as stateQ from '@/lib/db/queries/academyState'
import { logger } from '@/lib/logger'
import { SubmissionError } from '@/lib/academy/evaluation/registry'
import { AcademyError } from '@/lib/academy/service/errors'
import { gradeCard } from '@/lib/academy/service/reviews'
import { startPlacement, startPlanItem, startSkillPractice } from '@/lib/academy/service/start'
import { submitAttempt, type SubmitResult } from '@/lib/academy/service/submit'
import { playView, type PlayView } from '@/lib/academy/service/views'
import { GRADES } from '@/lib/academy/srs/sm2'
import { PLAN_MODES } from '@/lib/academy/selector/types'

type Result<T = object> = ({ success: true } & T) | { error: string }

function fail(what: string, err: unknown): { error: string } {
  if (err instanceof AcademyError || err instanceof SubmissionError) return { error: err.message }
  logger.error(`${what} failed`, { err: err instanceof Error ? err.message : String(err) })
  return { error: 'Something went wrong. Please try again.' }
}

const ID = z.string().trim().min(1).max(120)
const UUID = z.string().uuid()

export async function startPlanItemAction(planItemId: unknown): Promise<Result<{ href: string }>> {
  try {
    const userId = await requireUserId()
    const id = ID.safeParse(planItemId)
    if (!id.success) return { error: 'Unknown plan item.' }
    const { href } = await startPlanItem(userId, id.data)
    return { success: true, href }
  } catch (err) {
    return fail('startPlanItem', err)
  }
}

export async function startPlacementAction(): Promise<Result<{ href: string }>> {
  try {
    const userId = await requireUserId()
    const { href } = await startPlacement(userId)
    revalidatePath('/playground')
    return { success: true, href }
  } catch (err) {
    return fail('startPlacement', err)
  }
}

export async function startSkillPracticeAction(skillId: unknown): Promise<Result<{ href: string }>> {
  try {
    const userId = await requireUserId()
    const id = ID.safeParse(skillId)
    if (!id.success) return { error: 'Unknown skill.' }
    const { href } = await startSkillPractice(userId, id.data)
    return { success: true, href }
  } catch (err) {
    return fail('startSkillPractice', err)
  }
}

export async function submitAttemptAction(
  attemptId: unknown,
  choice: unknown,
): Promise<Result<{ result: SubmitResult; view: PlayView }>> {
  try {
    const userId = await requireUserId()
    const id = UUID.safeParse(attemptId)
    if (!id.success) return { error: 'That attempt was not found.' }
    const result = await submitAttempt(userId, id.data, { choice })
    const view = await playView(userId, id.data)
    if (!view) return { error: 'That attempt was not found.' }
    revalidatePath('/playground')
    revalidatePath('/playground/history')
    revalidatePath(`/playground/play/${id.data}`)
    return { success: true, result, view }
  } catch (err) {
    return fail('submitAttempt', err)
  }
}

const gradeSchema = z.object({ cardId: ID, grade: z.enum(GRADES) })

export async function gradeCardAction(input: unknown): Promise<Result<{ intervalDays: number; earned: string[] }>> {
  try {
    const userId = await requireUserId()
    const parsed = gradeSchema.safeParse(input)
    if (!parsed.success) return { error: 'Pick how well you remembered it.' }
    const r = await gradeCard(userId, parsed.data.cardId, parsed.data.grade)
    revalidatePath('/playground')
    return { success: true, intervalDays: r.intervalDays, earned: r.earned.map((a) => a.name) }
  } catch (err) {
    return fail('gradeCard', err)
  }
}

const prefsSchema = z.object({
  timeBudgetMin: z.coerce.number().int().min(5).max(240),
  mode: z.enum(PLAN_MODES),
})

/** Playground settings live on the hub (time budget and mode). */
export async function savePlaygroundPrefsAction(input: unknown): Promise<Result> {
  try {
    const userId = await requireUserId()
    const parsed = prefsSchema.safeParse(input)
    if (!parsed.success) return { error: 'Pick a daily time between 5 and 240 minutes.' }
    await stateQ.ensure(userId)
    await stateQ.update(userId, parsed.data)
    revalidatePath('/playground')
    return { success: true }
  } catch (err) {
    return fail('savePlaygroundPrefs', err)
  }
}
