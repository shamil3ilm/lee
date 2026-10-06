import rawSkills from '@/content/academy/skills.json'
import rawItems from '@/content/academy/items.json'
import rawCards from '@/content/academy/cards.json'
import rawAchievements from '@/content/academy/achievements.json'
import rawManifest from '@/content/academy/manifest.json'
import { validateSkillGraph, type SkillGraph } from './graph'
import {
  achievementsFileSchema,
  cardsFileSchema,
  issueLines,
  itemsFileSchema,
  manifestSchema,
  type Achievement,
  type Card,
  type Item,
} from './schema'

/**
 * The built-in content pack: graph + items + cards + achievements, cross-
 * validated (every reference resolves) and indexed. Loaded once per process;
 * an invalid pack throws at load so it can never be served half-broken.
 */

export interface AcademyContent {
  /** e.g. "academy-core". */
  packName: string
  packVersion: string
  graph: SkillGraph
  items: readonly Item[]
  itemById: ReadonlyMap<string, Item>
  itemsBySkill: ReadonlyMap<string, readonly Item[]>
  cards: readonly Card[]
  cardById: ReadonlyMap<string, Card>
  cardsBySkill: ReadonlyMap<string, readonly Card[]>
  achievements: readonly Achievement[]
}

export interface RawContent {
  skills: unknown
  items: unknown
  cards: unknown
  achievements: unknown
  manifest?: unknown
}

export type ContentResult = { ok: true; content: AcademyContent } | { ok: false; errors: string[] }

function groupBy<T extends { skillId: string }>(list: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const x of list) out.set(x.skillId, [...(out.get(x.skillId) ?? []), x])
  return out
}

function duplicateIds(prefix: string, ids: readonly string[]): string[] {
  const seen = new Set<string>()
  return ids.flatMap((id) => {
    if (seen.has(id)) return [`${prefix} "${id}" is duplicated`]
    seen.add(id)
    return []
  })
}

function itemErrors(items: readonly Item[], graph: SkillGraph): string[] {
  const errors = duplicateIds('item', items.map((i) => i.id))
  for (const i of items) {
    if (!graph.byId.has(i.skillId)) errors.push(`${i.id}: unknown skill "${i.skillId}"`)
    if (i.answer >= i.choices.length) errors.push(`${i.id}: answer ${i.answer} is out of range`)
    if (i.format === 'predict_output' && !i.code) errors.push(`${i.id}: predict_output needs code`)
    if (new Set(i.choices).size !== i.choices.length) errors.push(`${i.id}: choices repeat`)
  }
  return errors
}

function cardErrors(cards: readonly Card[], graph: SkillGraph): string[] {
  const errors = duplicateIds('card', cards.map((c) => c.id))
  for (const c of cards) if (!graph.byId.has(c.skillId)) errors.push(`${c.id}: unknown skill "${c.skillId}"`)
  return errors
}

export function validateContent(raw: RawContent): ContentResult {
  const g = validateSkillGraph(raw.skills)
  const items = itemsFileSchema.safeParse(raw.items)
  const cards = cardsFileSchema.safeParse(raw.cards)
  const achievements = achievementsFileSchema.safeParse(raw.achievements)
  const manifest = manifestSchema.safeParse(raw.manifest ?? { pack: 'test', version: '0.0.0' })
  const errors = [
    ...(g.ok ? [] : g.errors),
    ...(items.success ? [] : issueLines('items', items.error)),
    ...(cards.success ? [] : issueLines('cards', cards.error)),
    ...(achievements.success ? [] : issueLines('achievements', achievements.error)),
    ...(manifest.success ? [] : issueLines('manifest', manifest.error)),
  ]
  if (!g.ok || !items.success || !cards.success || !achievements.success || !manifest.success) {
    return { ok: false, errors }
  }
  const refErrors = [
    ...itemErrors(items.data.items, g.graph),
    ...cardErrors(cards.data.cards, g.graph),
    ...duplicateIds('achievement', achievements.data.achievements.map((a) => a.id)),
  ]
  if (refErrors.length > 0) return { ok: false, errors: refErrors }
  const itemList = items.data.items
  const cardList = cards.data.cards
  return {
    ok: true,
    content: {
      packName: manifest.data.pack,
      packVersion: manifest.data.version,
      graph: g.graph,
      items: itemList,
      itemById: new Map(itemList.map((i) => [i.id, i])),
      itemsBySkill: groupBy(itemList),
      cards: cardList,
      cardById: new Map(cardList.map((c) => [c.id, c])),
      cardsBySkill: groupBy(cardList),
      achievements: achievements.data.achievements,
    },
  }
}

let cached: AcademyContent | null = null

/** The shipped pack (validated once per process). Throws when invalid. */
export function loadAcademyContent(): AcademyContent {
  if (cached) return cached
  const result = validateContent({
    skills: rawSkills,
    items: rawItems,
    cards: rawCards,
    achievements: rawAchievements,
    manifest: rawManifest,
  })
  if (!result.ok) throw new Error(`Invalid Playground content pack: ${result.errors.slice(0, 5).join('; ')}`)
  cached = result.content
  return cached
}
