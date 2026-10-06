import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as ratingsQ from '@/lib/db/queries/academyRatings'
import * as stateQ from '@/lib/db/queries/academyState'
import { parseResumeProfile } from '@/lib/resume/types'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { getTodayPlan } from '@/lib/academy/service/plan'
import { startPlanItem, startPlacement, startSkillPractice } from '@/lib/academy/service/start'
import { submitAttempt } from '@/lib/academy/service/submit'
import { dueCards, gradeCard } from '@/lib/academy/service/reviews'
import { getHubData } from '@/lib/academy/service/hub'
import { attemptHistory, playView, skillDetail } from '@/lib/academy/service/views'
import { ACADEMY_ENGINE_VERSION } from '@/lib/academy/version'
import { makeApplication, makeCompany, makeJob, makeUser } from '../factories'

// Synthetic data only.
const content = loadAcademyContent()
const NOW = new Date('2026-10-06T08:00:00Z')

async function saveProfile(userId: string): Promise<void> {
  await profileQ.upsert(userId, {
    resume: parseResumeProfile({
      projects: [
        { id: 'pr-cert', name: 'Cert-Ed', keywords: ['PostgreSQL'] },
        { id: 'pr-dns', name: 'Toy DNS', keywords: ['DNS', 'Go'], depth: 'ai_assisted', domainReady: true, interviewReady: false, studyTarget: '2026-10-20' },
      ],
    }),
  })
}

async function answer(userId: string, attemptId: string, correct: boolean, at: Date): Promise<ReturnType<typeof submitAttempt>> {
  const view = await playView(userId, attemptId)
  if (!view) throw new Error('no view')
  const item = content.itemById.get((await attemptsQ.get(userId, attemptId))!.itemId)!
  const choice = correct ? item.answer : (item.answer + 1) % item.choices.length
  return submitAttempt(userId, attemptId, { choice }, at)
}

describe('academy core: placement → plan → attempt → rating → history → plan', () => {
  it('seeds from interview-ready evidence only and maps AI-assisted work to study targets', async () => {
    const u = await makeUser()
    await saveProfile(u.id)
    const { ctx, items } = await getTodayPlan(u.id, NOW)
    const sql = await ratingsQ.get(u.id, 'sql-querying')
    expect(sql?.level).toBe(3)
    expect((sql?.seed as { explanation: string }).explanation).toBe('Seeded at Competent from: Cert-Ed (own)')
    // AI-assisted, domain-ready work never seeds a rating.
    expect(await ratingsQ.get(u.id, 'dns')).toBeNull()
    expect(await ratingsQ.get(u.id, 'go')).toBeNull()
    expect(ctx.placement.studyTargets.map((t) => t.skillId).sort()).toEqual(['dns', 'go'])
    // The study list shows up in the plan, with its reason.
    const study = items.filter((i) => i.kind === 'study')
    expect(study.length).toBeGreaterThan(0)
    expect(study[0]!.reasons[0]!.text).toMatch(/study list.*Toy DNS.*Oct 20/)
    // The profile flags were read, not changed.
    const row = await profileQ.get(u.id)
    expect(JSON.stringify(row?.resume)).toContain('"interviewReady":false')
  })

  it('a plan item attempt updates rating, history, XP/streak, plan status and is counted once', async () => {
    const u = await makeUser()
    await saveProfile(u.id)
    const { items } = await getTodayPlan(u.id, NOW)
    const practice = items.find((i) => i.itemId !== null)!
    const { href } = await startPlanItem(u.id, practice.id, NOW)
    const attemptId = href.split('/').pop()!

    // The workbench never sees the answer before submitting.
    const before = await playView(u.id, attemptId)
    expect(before?.result).toBeNull()
    expect(JSON.stringify(before)).not.toContain('"answer"')

    const ratingBefore = await ratingsQ.get(u.id, practice.skillId!)
    const result = await answer(u.id, attemptId, true, new Date(NOW.getTime() + 40_000))
    expect(result.evaluation.composite).toBeGreaterThan(70)
    expect(result.xp).toBeGreaterThan(0)

    const ratingAfter = await ratingsQ.get(u.id, practice.skillId!)
    expect(ratingAfter!.rating).toBeGreaterThan(ratingBefore?.rating ?? 1400)
    expect(ratingAfter!.attempts).toBe(1)

    const history = await ratingsQ.history(u.id, practice.skillId!)
    expect(history.at(-1)).toMatchObject({ kind: 'attempt', attemptId })

    const attempt = await attemptsQ.get(u.id, attemptId)
    expect(attempt).toMatchObject({ engineVersion: ACADEMY_ENGINE_VERSION, contentVersion: `academy-core@${content.packVersion}` })

    const state = await stateQ.ensure(u.id)
    expect(state.xp).toBe(result.xp)
    expect(state.streakDays).toBe(1)
    expect(result.earned.map((a) => a.id)).toContain('first-steps')

    // The plan item is done and the plan keeps it.
    const again = await getTodayPlan(u.id, new Date(NOW.getTime() + 60_000))
    expect(again.items.find((i) => i.id === practice.id)).toMatchObject({ status: 'done', attemptId })

    // A replayed submit changes nothing.
    const replay = await answer(u.id, attemptId, false, new Date(NOW.getTime() + 90_000))
    expect(replay.alreadySubmitted).toBe(true)
    expect((await stateQ.ensure(u.id)).xp).toBe(result.xp)
    expect(await ratingsQ.history(u.id, practice.skillId!)).toHaveLength(history.length)

    // History lists it; the skill page has the level-over-time points.
    const timeline = await attemptHistory(u.id)
    expect(timeline.map((e) => e.id)).toEqual([attemptId])
    const detail = await skillDetail(u.id, practice.skillId!, NOW)
    expect(detail?.recent[0]?.id).toBe(attemptId)
    expect(detail?.history.length).toBeGreaterThan(0)

    // Its concept cards are enrolled for spaced review (due tomorrow after a correct answer).
    expect(await dueCards(u.id, NOW)).toEqual([])
    const tomorrow = await dueCards(u.id, new Date(NOW.getTime() + 2 * 86_400_000))
    expect(tomorrow.map((c) => c.skillId)).toContain(practice.skillId)
  })

  it('a wrong answer lowers the rating and makes the card due now; grading it schedules it', async () => {
    const u = await makeUser()
    const { href } = await startSkillPractice(u.id, 'dns', NOW)
    const id = href.split('/').pop()!
    const r = await answer(u.id, id, false, new Date(NOW.getTime() + 20_000))
    expect(r.evaluation.composite).toBe(0)
    const dns = await ratingsQ.get(u.id, 'dns')
    expect(dns!.rating).toBeLessThan(1400)
    const due = await dueCards(u.id, new Date(NOW.getTime() + 30_000))
    expect(due.map((c) => c.cardId)).toEqual(['card-dns'])
    const graded = await gradeCard(u.id, 'card-dns', 'good', new Date(NOW.getTime() + 40_000))
    expect(graded.intervalDays).toBe(1)
    expect(await dueCards(u.id, new Date(NOW.getTime() + 50_000))).toEqual([])
    expect((await stateQ.ensure(u.id)).reviewsDone).toBe(1)
  })

  it('upcoming interviews (≤7 days) put a mapped skill in the plan with the stage as its reason', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id, { name: 'Example Co' })
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)
    await db.insert(s.interviewStages).values({
      userId: u.id,
      applicationId: a.id,
      kind: 'system_design',
      status: 'scheduled',
      scheduledAt: new Date('2026-10-08T10:00:00Z'),
    })
    const { items } = await getTodayPlan(u.id, NOW)
    const interview = items.find((i) => i.kind === 'interview')
    expect(interview).toBeDefined()
    expect(interview!.reasons[0]!.text).toMatch(/System design interview at Example Co in 2 days/)
    const hub = await getHubData(u.id, NOW)
    expect(hub.interviews[0]?.label).toBe('System design')
  })

  it('placement diagnostic walks a few items per domain, adjusts seeds, then completes', async () => {
    const u = await makeUser()
    await saveProfile(u.id)
    let at = NOW.getTime()
    let next = await startPlacement(u.id, new Date(at))
    let n = 0
    while (next.href.startsWith('/playground/play/') && n < 20) {
      const id = next.href.split('/').pop()!
      at += 30_000
      const res = await answer(u.id, id, n % 3 !== 0, new Date(at))
      n += 1
      if (res.next !== 'placement') break
      next = await startPlacement(u.id, new Date(at))
    }
    expect(n).toBeGreaterThanOrEqual(8)
    expect(n).toBeLessThanOrEqual(12)
    const state = await stateQ.ensure(u.id)
    expect(state.placementCompletedAt).not.toBeNull()
    const diag = await db.select().from(s.academyRatingHistory).where(eq(s.academyRatingHistory.userId, u.id))
    expect(diag.filter((h) => h.kind === 'diagnostic')).toHaveLength(n)
    const hub = await getHubData(u.id, new Date(at))
    expect(hub.placement.done).toBe(true)
    expect(hub.plan.some((i) => i.kind === 'placement')).toBe(false)
    expect(hub.achievements.map((a) => a.id)).toContain('placed')
  })

  it('suggests marking a study item interview-ready at Competent, without touching the profile', async () => {
    const u = await makeUser()
    await saveProfile(u.id)
    await getTodayPlan(u.id, NOW)
    await ratingsQ.upsert(u.id, { skillId: 'dns', rating: 1450, deviation: 120, level: 3, attempts: 4, lastPracticedAt: NOW, seed: null })
    const hub = await getHubData(u.id, NOW)
    expect(hub.suggestions.map((x) => x.studyItemId)).toEqual(['pr-dns'])
    const row = await profileQ.get(u.id)
    expect(JSON.stringify(row?.resume)).toContain('"interviewReady":false')
  })
})
