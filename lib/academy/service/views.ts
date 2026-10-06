import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as ratingsQ from '@/lib/db/queries/academyRatings'
import type { AttemptRow } from '@/lib/db/queries/academyAttempts'
import { loadAcademyContent, type AcademyContent } from '@/lib/academy/content/catalog'
import type { ItemFormat } from '@/lib/academy/content/schema'
import { choiceOrder } from '@/lib/academy/evaluation/shuffle'
import { readEvaluation, type AttemptEvaluation } from '@/lib/academy/evaluation/types'
import { isLevel, type Level } from '@/lib/academy/levels'
import { ratingAsOf } from '@/lib/academy/rating'
import { readSeed } from './skill-states'

/** Read models for the play page, the history timeline and the skill page. */

export interface HistoryEntry {
  id: string
  submittedAt: Date
  skillId: string
  skillName: string
  domain: string
  format: string
  mode: string
  composite: number
  correct: boolean
  xp: number
  ratingBefore: number | null
  ratingAfter: number | null
  contentVersion: string
  engineVersion: string
}

function toEntry(row: AttemptRow, content: AcademyContent): HistoryEntry | null {
  if (!row.submittedAt) return null
  const skill = content.graph.byId.get(row.skillId)
  const ev = readEvaluation(row.evaluation)
  return {
    id: row.id,
    submittedAt: row.submittedAt,
    skillId: row.skillId,
    skillName: skill?.name ?? row.skillId,
    domain: skill ? (content.graph.domainById.get(skill.domain)?.name ?? '') : '',
    format: row.format,
    mode: row.mode,
    composite: row.composite ?? 0,
    correct: ev ? ev.outcome >= 1 : (row.composite ?? 0) > 0,
    xp: row.xpAwarded,
    ratingBefore: row.ratingBefore,
    ratingAfter: row.ratingAfter,
    contentVersion: row.contentVersion,
    engineVersion: row.engineVersion,
  }
}

export async function attemptHistory(userId: string, filter: { skillId?: string; limit?: number } = {}): Promise<HistoryEntry[]> {
  const content = loadAcademyContent()
  const rows = await attemptsQ.listSubmitted(userId, filter)
  return rows.flatMap((r) => {
    const e = toEntry(r, content)
    return e ? [e] : []
  })
}

export interface PlayView {
  attemptId: string
  skillId: string
  skillName: string
  format: ItemFormat
  mode: string
  prompt: string
  code: string | null
  language: string | null
  parSec: number
  /** Display order; `index` is the original choice index sent back on submit. */
  choices: Array<{ index: number; text: string }>
  startedAt: Date
  result: null | {
    chosen: number | null
    answer: number
    explanation: string
    evaluation: AttemptEvaluation
    xp: number
  }
}

/** The attempt as the workbench shows it. The answer is only included once submitted. */
export async function playView(userId: string, attemptId: string): Promise<PlayView | null> {
  const content = loadAcademyContent()
  const row = await attemptsQ.get(userId, attemptId)
  if (!row) return null
  const item = content.itemById.get(row.itemId)
  if (!item) return null
  const order = choiceOrder(item.choices.length, row.seed)
  const evaluation = row.submittedAt ? readEvaluation(row.evaluation) : null
  const chosen = (row.submission as { choice?: unknown } | null)?.choice
  return {
    attemptId: row.id,
    skillId: item.skillId,
    skillName: content.graph.byId.get(item.skillId)?.name ?? item.skillId,
    format: item.format,
    mode: row.mode,
    prompt: item.prompt,
    code: item.code ?? null,
    language: item.language ?? null,
    parSec: item.parSec,
    choices: order.map((index) => ({ index, text: item.choices[index] ?? '' })),
    startedAt: row.startedAt,
    result: evaluation
      ? {
          chosen: typeof chosen === 'number' ? chosen : null,
          answer: item.answer,
          explanation: item.explanation,
          evaluation,
          xp: row.xpAwarded,
        }
      : null,
  }
}

export interface SkillDetail {
  id: string
  name: string
  domain: string
  level: Level
  rating: number | null
  deviation: number | null
  attempts: number
  descriptors: readonly string[]
  seedExplanation: string | null
  prerequisites: Array<{ id: string; name: string; level: number }>
  unlocks: Array<{ id: string; name: string }>
  history: Array<{ at: Date; rating: number; level: number; kind: string }>
  recent: HistoryEntry[]
}

export async function skillDetail(userId: string, skillId: string, now: Date = new Date()): Promise<SkillDetail | null> {
  const content = loadAcademyContent()
  const skill = content.graph.byId.get(skillId)
  if (!skill) return null
  const [rows, history, recent] = await Promise.all([
    ratingsQ.list(userId),
    ratingsQ.history(userId, skillId),
    attemptHistory(userId, { skillId, limit: 10 }),
  ])
  const levels = new Map(rows.map((r) => [r.skillId, r.level]))
  const row = rows.find((r) => r.skillId === skillId)
  const r = row ? ratingAsOf({ rating: row.rating, deviation: row.deviation, lastPracticedAt: row.lastPracticedAt }, now) : null
  return {
    id: skill.id,
    name: skill.name,
    domain: content.graph.domainById.get(skill.domain)?.name ?? skill.domain,
    level: row && isLevel(row.level) ? row.level : 0,
    rating: r ? Math.round(r.rating) : null,
    deviation: r ? Math.round(r.deviation) : null,
    attempts: row?.attempts ?? 0,
    descriptors: skill.levels,
    seedExplanation: readSeed(row?.seed)?.explanation ?? null,
    prerequisites: skill.prerequisites.map((p) => ({ id: p, name: content.graph.byId.get(p)?.name ?? p, level: levels.get(p) ?? 0 })),
    unlocks: content.graph.skills.filter((s) => s.prerequisites.includes(skill.id)).map((s) => ({ id: s.id, name: s.name })),
    history: history.map((h) => ({ at: h.createdAt, rating: h.rating, level: h.level, kind: h.kind })),
    recent,
  }
}
