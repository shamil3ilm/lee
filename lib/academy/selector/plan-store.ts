import { z } from 'zod'
import { PLAN_ITEM_KINDS, type PlanItem } from './types'

/** Lenient read/write helpers for the stored plan (academy_plans.items). Pure. */

const planItemSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(PLAN_ITEM_KINDS),
  skillId: z.string().max(60).nullable(),
  itemId: z.string().max(60).nullable(),
  minutes: z.number().int().min(0).max(240),
  title: z.string().max(120),
  reasons: z.array(z.object({ code: z.enum(PLAN_ITEM_KINDS), text: z.string().max(400) })).max(4),
  status: z.enum(['todo', 'done']),
  attemptId: z.string().max(60).nullable(),
})

/** Valid items of a stored plan (broken entries are dropped, never thrown). */
export function readPlanItems(value: unknown): PlanItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((v) => {
    const parsed = planItemSchema.safeParse(v)
    return parsed.success ? [parsed.data] : []
  })
}

/** The plan with one item marked done by an attempt (new array). */
export function markDone(items: readonly PlanItem[], planItemId: string, attemptId: string): PlanItem[] {
  return items.map((i) => (i.id === planItemId ? { ...i, status: 'done' as const, attemptId } : i))
}

