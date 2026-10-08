import * as reviewsQ from '@/lib/db/queries/academyReviews'
import * as briefsQ from '@/lib/db/queries/radarBriefs'
import * as itemsQ from '@/lib/db/queries/radarItems'
import { db } from '@/lib/db/client'
import { logger } from '@/lib/logger'
import { RadarError } from '../errors'
import { BRIEF_SECTIONS, type BriefModule, type BriefModuleCard, type BriefSectionId, type BriefSections } from './types'

/**
 * "Learn this": a confirmed brief becomes a small Playground module — the
 * brief is the reading, each filled section becomes an SM-2 concept card in
 * the existing academy_reviews table, and a model links to the Model Arena
 * lab. 13.x has no module table, so the module record lives on the brief
 * (radar_briefs.module) and its cards use ids `radar:<briefId>:<section>`
 * under the pseudo-skill RADAR_SKILL_ID. Reviews earn XP like any card.
 */

export const RADAR_SKILL_ID = 'radar'
export const RADAR_SKILL_NAME = 'AI Radar'
const CARD_PREFIX = 'radar:'
const BACK_MAX = 400

const QUESTION: Readonly<Record<BriefSectionId, (name: string) => string>> = {
  what: (n) => `What is ${n}?`,
  architecture: (n) => `What is the key idea of ${n}'s architecture?`,
  workflow: (n) => `How does a request flow through ${n}?`,
  how_to_use: (n) => `How do you use ${n}?`,
  tradeoffs: (n) => `What are the trade-offs or limits of ${n}?`,
  security: (n) => `What security point should you know about ${n}?`,
  compared_with: (n) => `What is ${n} compared with?`,
}

export function cardId(briefId: string, section: BriefSectionId): string {
  return `${CARD_PREFIX}${briefId}:${section}`
}

export function isRadarCardId(id: string): boolean {
  return id.startsWith(CARD_PREFIX)
}

export function briefIdOfCard(id: string): string | null {
  const m = /^radar:([0-9a-f-]{36}):/.exec(id)
  return m ? (m[1] as string) : null
}

/** Pure: the module for a brief. */
export function buildModule(briefId: string, entry: { name: string; kind: string }, sections: BriefSections, now: Date): BriefModule {
  const cards: BriefModuleCard[] = BRIEF_SECTIONS.flatMap((id) => {
    const sentences = sections[id] ?? []
    if (sentences.length === 0) return []
    const back = sentences.map((s) => s.text).join(' ')
    return [{ id: cardId(briefId, id), front: QUESTION[id](entry.name), back: back.length > BACK_MAX ? `${back.slice(0, BACK_MAX - 1)}…` : back }]
  })
  const lab = entry.kind === 'model' ? { href: '/playground/models', label: 'Compare models in the Model Arena' } : null
  return { cards, lab, createdAt: now.toISOString() }
}

export async function learnThis(userId: string, entryId: string, now: Date = new Date()): Promise<BriefModule> {
  const [entry, brief] = await Promise.all([itemsQ.getEntry(userId, entryId), briefsQ.getByEntry(userId, entryId)])
  if (!entry || !brief) throw new RadarError('Save a brief first.', 'not_found')
  const mod = (brief.module as BriefModule | null) ?? buildModule(brief.id, entry, brief.sections as BriefSections, now)
  if (mod.cards.length === 0) throw new RadarError('The brief has nothing to learn yet.')
  await db.transaction(async (tx) => {
    await reviewsQ.enroll(userId, mod.cards.map((c) => ({ cardId: c.id, skillId: RADAR_SKILL_ID, dueAt: now })), tx)
    if (!brief.module) await briefsQ.setModule(userId, brief.id, mod, tx)
  })
  logger.info('radar_module_created', { cards: mod.cards.length, lab: mod.lab ? 1 : 0 })
  return mod
}

/** Front/back of radar cards by id (the review session's lookup). */
export async function radarCards(userId: string, ids: readonly string[]): Promise<Map<string, BriefModuleCard>> {
  const briefIds = [...new Set(ids.map(briefIdOfCard).filter((x): x is string => !!x))]
  const rows = await briefsQ.modulesByIds(userId, briefIds)
  const out = new Map<string, BriefModuleCard>()
  for (const r of rows) for (const c of (r.module as BriefModule | null)?.cards ?? []) out.set(c.id, c)
  return out
}
