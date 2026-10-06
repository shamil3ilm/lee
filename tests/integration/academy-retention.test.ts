import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as stateQ from '@/lib/db/queries/academyState'
import { compactAcademyHistory, ACADEMY_ATTEMPT_DETAIL_DAYS } from '@/lib/db/retention/academy'
import { runRetentionForUser } from '@/lib/db/retention/run'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { evaluateAttempt } from '@/lib/academy/evaluation/registry'
import { compactEvaluation, readEvaluation } from '@/lib/academy/evaluation/types'
import { readPlanItems } from '@/lib/academy/selector/plan-store'
import { buildPlan } from '@/lib/academy/selector/plan'
import { makeUser } from '../factories'

const content = loadAcademyContent()
const NOW = new Date('2026-10-06T08:00:00Z')
const DAY = 86_400_000

async function oldAttempt(userId: string, daysAgo: number): Promise<string> {
  const item = content.itemById.get('dns-ttl')!
  const at = new Date(NOW.getTime() - daysAgo * DAY)
  const evaluation = evaluateAttempt(item, { choice: (item.answer + 1) % item.choices.length }, { elapsedSec: 200, hintsUsed: 0 })
  const row = await attemptsQ.create(userId, {
    itemId: item.id,
    skillId: item.skillId,
    format: item.format,
    contentVersion: 'academy-core@13.0.0',
    engineVersion: '13.0.0',
    difficulty: item.difficulty,
    startedAt: at,
  })
  await attemptsQ.submit(userId, row.id, {
    submittedAt: at,
    elapsedSec: 200,
    submission: { choice: 0 },
    evaluation,
    composite: evaluation.composite,
    xpAwarded: 3,
    ratingBefore: 1400,
    ratingAfter: 1380,
  })
  await db.insert(s.academyRatingHistory).values({ userId, skillId: item.skillId, attemptId: row.id, kind: 'attempt', rating: 1380, deviation: 300, level: 2 })
  return row.id
}

describe('academy retention compacts, never deletes', () => {
  it('compacts old attempt detail and plan reasons, keeping every row and score', async () => {
    const u = await makeUser()
    const oldId = await oldAttempt(u.id, ACADEMY_ATTEMPT_DETAIL_DAYS + 5)
    const recentId = await oldAttempt(u.id, 3)
    const plan = buildPlan({
      content,
      now: NOW,
      today: '2026-06-01',
      timeBudgetMin: 30,
      mode: 'balanced',
      ratings: new Map(),
      dueReviews: 3,
      interviews: [],
      studyTargets: [],
      recentItemIds: [],
      placement: { done: true, remaining: 0 },
    })
    await stateQ.savePlan(u.id, '2026-06-01', { items: plan.items, signature: 'x', reason: 'generated' })
    await stateQ.savePlan(u.id, '2026-10-05', { items: plan.items, signature: 'x', reason: 'generated' })

    const before = (await attemptsQ.get(u.id, oldId))!
    const changed = await compactAcademyHistory(NOW, { userId: u.id })
    expect(changed).toBe(2)

    const after = (await attemptsQ.get(u.id, oldId))!
    const ev = readEvaluation(after.evaluation)!
    expect(ev).toEqual(compactEvaluation(readEvaluation(before.evaluation)!))
    expect(after.composite).toBe(before.composite)
    expect(after.compactedAt).not.toBeNull()
    expect(JSON.stringify(after.evaluation).length).toBeLessThan(JSON.stringify(before.evaluation).length)

    // Recent rows are untouched; nothing was deleted.
    expect((await attemptsQ.get(u.id, recentId))!.compactedAt).toBeNull()
    expect(await db.select().from(s.academyAttempts).where(eq(s.academyAttempts.userId, u.id))).toHaveLength(2)
    expect(await db.select().from(s.academyRatingHistory).where(eq(s.academyRatingHistory.userId, u.id))).toHaveLength(2)

    const oldPlan = readPlanItems((await stateQ.getPlan(u.id, '2026-06-01'))!.items)
    expect(oldPlan).toHaveLength(plan.items.length)
    expect(oldPlan[0]!.reasons).toEqual([{ code: plan.items[0]!.reasons[0]!.code, text: '' }])
    const newPlan = readPlanItems((await stateQ.getPlan(u.id, '2026-10-05'))!.items)
    expect(newPlan[0]!.reasons[0]!.text.length).toBeGreaterThan(0)

    // Idempotent.
    expect(await compactAcademyHistory(NOW, { userId: u.id })).toBe(0)
  })

  it('runs as a step of the user cleanup', async () => {
    const u = await makeUser()
    await oldAttempt(u.id, ACADEMY_ATTEMPT_DETAIL_DAYS + 1)
    const result = await runRetentionForUser(u.id, NOW)
    expect(result.academyHistory).toBe(1)
  })
})
