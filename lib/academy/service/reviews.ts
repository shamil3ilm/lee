import { db } from '@/lib/db/client'
import * as reviewsQ from '@/lib/db/queries/academyReviews'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { localDay } from '@/lib/academy/day'
import { XP_PER_REVIEW } from '@/lib/academy/gamification/xp'
import { GRADE_QUALITY, nextDue, reviewCard, type Grade } from '@/lib/academy/srs/sm2'
import { AcademyError } from './errors'
import { applyProgress } from './progress'

/** Spaced review of concept cards (SM-2). */

export interface DueCard {
  cardId: string
  skillId: string
  skillName: string
  front: string
  back: string
}

export async function dueCards(userId: string, now: Date = new Date(), limit = 20): Promise<DueCard[]> {
  const content = loadAcademyContent()
  const rows = await reviewsQ.listDue(userId, now, limit)
  return rows.flatMap((r) => {
    const card = content.cardById.get(r.cardId)
    if (!card) return []
    const skillName = content.graph.byId.get(card.skillId)?.name ?? card.skillId
    return [{ cardId: card.id, skillId: card.skillId, skillName, front: card.front, back: card.back }]
  })
}

export interface ReviewResult {
  intervalDays: number
  earned: Array<{ id: string; name: string }>
}

export async function gradeCard(userId: string, cardId: string, grade: Grade, now: Date = new Date()): Promise<ReviewResult> {
  const content = loadAcademyContent()
  const row = await reviewsQ.get(userId, cardId)
  if (!row || !content.cardById.has(cardId)) throw new AcademyError('not_found', 'That card is not in your reviews.')
  const next = reviewCard(row, GRADE_QUALITY[grade])
  const today = localDay(now, await getUserTimeZone(userId))
  return db.transaction(async (tx) => {
    await reviewsQ.update(userId, cardId, { ...next, dueAt: nextDue(now, next.intervalDays), lastReviewedAt: now }, tx)
    const progress = await applyProgress(userId, content, { today, xpGain: XP_PER_REVIEW, reviewsGain: 1, attemptId: null }, tx)
    return { intervalDays: next.intervalDays, earned: progress.earned }
  })
}
