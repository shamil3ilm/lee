import { z } from 'zod'

/**
 * Zod schemas for the versioned Playground content under `content/academy/`
 * (v13 §2, §10). Content is data: adding a skill, an item or an achievement
 * is a JSON edit, validated here and by tests/unit/academy-graph.test.ts.
 * Pure and client-safe.
 */

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/
const id = z.string().regex(ID)
const shortText = (max: number) => z.string().trim().min(1).max(max)

export const domainSchema = z.object({
  id: z.string().regex(/^[a-z][a-z_]{0,31}$/),
  name: shortText(60),
})
export type Domain = z.infer<typeof domainSchema>

export const skillSchema = z.object({
  id,
  name: shortText(80),
  domain: z.string().min(1),
  prerequisites: z.array(id).max(8).default([]),
  /** Matched exactly against profile skill names and keywords. */
  aliases: z.array(shortText(60)).max(20).default([]),
  /** Matched as whole words inside highlight and project text. */
  textAliases: z.array(shortText(60)).max(20).default([]),
  /** Descriptors for levels 1–5 (Novice → Expert); level 0 is "Unassessed". */
  levels: z.array(shortText(120)).length(5),
})
export type SkillDef = z.infer<typeof skillSchema>

export const skillGraphFileSchema = z.object({
  version: shortText(40),
  domains: z.array(domainSchema).min(1).max(40),
  skills: z.array(skillSchema).min(1).max(500),
})

export const ITEM_FORMATS = ['concept_check', 'predict_output'] as const
export type ItemFormat = (typeof ITEM_FORMATS)[number]

export const itemSchema = z.object({
  id,
  skillId: z.string().min(1),
  format: z.enum(ITEM_FORMATS),
  /** Item difficulty on the rating scale (calibrated from attempts in 13.6). */
  difficulty: z.number().int().min(800).max(2400),
  /** Par time in seconds; the time axis compares against it (not a race). */
  parSec: z.number().int().min(10).max(1800),
  prompt: shortText(600),
  code: z.string().max(1200).optional(),
  language: z.enum(['javascript', 'typescript', 'python', 'go', 'sql', 'bash', 'php', 'rust']).optional(),
  choices: z.array(shortText(300)).min(2).max(5),
  answer: z.number().int().min(0),
  explanation: shortText(600),
})
export type Item = z.infer<typeof itemSchema>

export const itemsFileSchema = z.object({
  version: shortText(40),
  items: z.array(itemSchema).min(1).max(5000),
})

export const cardSchema = z.object({
  id,
  skillId: z.string().min(1),
  front: shortText(300),
  back: shortText(600),
})
export type Card = z.infer<typeof cardSchema>

export const cardsFileSchema = z.object({
  version: shortText(40),
  cards: z.array(cardSchema).max(5000),
})

export const RANKS = ['intern', 'junior', 'mid', 'senior', 'staff', 'principal'] as const
export type Rank = (typeof RANKS)[number]

export const achievementRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('attempts'), count: z.number().int().min(1) }),
  z.object({ type: z.literal('high_scores'), count: z.number().int().min(1), minComposite: z.number().min(0).max(100) }),
  z.object({ type: z.literal('placement_done') }),
  z.object({ type: z.literal('streak'), days: z.number().int().min(1) }),
  z.object({ type: z.literal('skill_level'), level: z.number().int().min(1).max(5), count: z.number().int().min(1) }),
  z.object({ type: z.literal('domains'), count: z.number().int().min(1) }),
  z.object({ type: z.literal('reviews'), count: z.number().int().min(1) }),
  z.object({ type: z.literal('rank'), rank: z.enum(RANKS) }),
])
export type AchievementRule = z.infer<typeof achievementRuleSchema>

export const achievementSchema = z.object({
  id,
  name: shortText(60),
  description: shortText(200),
  rule: achievementRuleSchema,
})
export type Achievement = z.infer<typeof achievementSchema>

export const achievementsFileSchema = z.object({
  version: shortText(40),
  achievements: z.array(achievementSchema).max(500),
})

export const manifestSchema = z.object({
  pack: shortText(60),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
})

/** Zod issues as "path: message" lines. */
export function issueLines(prefix: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${prefix}${i.path.length > 0 ? `.${i.path.join('.')}` : ''}: ${i.message}`)
}
