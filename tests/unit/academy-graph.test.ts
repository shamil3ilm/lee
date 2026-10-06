import { describe, expect, it } from 'vitest'
import { validateSkillGraph, topologicalOrder } from '@/lib/academy/content/graph'
import { loadAcademyContent, validateContent } from '@/lib/academy/content/catalog'
import rawSkills from '@/content/academy/skills.json'
import rawItems from '@/content/academy/items.json'
import rawCards from '@/content/academy/cards.json'
import rawAchievements from '@/content/academy/achievements.json'

const levels = ['a', 'b', 'c', 'd', 'e']

function skill(id: string, prerequisites: string[] = [], domain = 'foundations') {
  return { id, name: id.toUpperCase(), domain, prerequisites, aliases: [], textAliases: [], levels }
}

function graph(skills: unknown[]) {
  return { version: 't1', domains: [{ id: 'foundations', name: 'Foundations' }], skills }
}

describe('skill graph validation', () => {
  it('accepts the shipped graph: acyclic, prerequisites exist, ids unique', () => {
    const result = validateSkillGraph(rawSkills)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.graph.skills.length).toBeGreaterThanOrEqual(30)
    // Every domain named in the spec's study-list examples exists.
    for (const id of ['go', 'rust', 'dns', 'email-delivery']) {
      expect(result.graph.byId.has(id)).toBe(true)
    }
  })

  it('rejects a cycle and names it', () => {
    const result = validateSkillGraph(graph([skill('a', ['c']), skill('b', ['a']), skill('c', ['b'])]))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toMatch(/cycle/i)
  })

  it('rejects a self-prerequisite', () => {
    const result = validateSkillGraph(graph([skill('a', ['a'])]))
    expect(result.ok).toBe(false)
  })

  it('rejects a missing prerequisite', () => {
    const result = validateSkillGraph(graph([skill('a', ['ghost'])]))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain('a: prerequisite "ghost" does not exist')
  })

  it('rejects duplicate ids and unknown domains', () => {
    const dup = validateSkillGraph(graph([skill('a'), skill('a')]))
    expect(dup.ok).toBe(false)
    const domain = validateSkillGraph(graph([skill('a', [], 'nowhere')]))
    expect(domain.ok).toBe(false)
    if (domain.ok) return
    expect(domain.errors.join(' ')).toMatch(/unknown domain/)
  })

  it('requires exactly five level descriptors (levels 1–5)', () => {
    const result = validateSkillGraph(graph([{ ...skill('a'), levels: ['only one'] }]))
    expect(result.ok).toBe(false)
  })

  it('orders prerequisites before dependants', () => {
    const result = validateSkillGraph(graph([skill('c', ['b']), skill('b', ['a']), skill('a')]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const order = topologicalOrder(result.graph)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'))
  })
})

describe('content pack validation', () => {
  it('loads the shipped pack: every item, card and achievement is valid', () => {
    const content = loadAcademyContent()
    expect(content.items.length).toBeGreaterThanOrEqual(60)
    expect(content.cards.length).toBe(content.graph.skills.length)
    expect(content.achievements.length).toBeGreaterThan(5)
    expect(content.packVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('every skill has at least two built-in items', () => {
    const content = loadAcademyContent()
    for (const s of content.graph.skills) {
      expect(content.itemsBySkill.get(s.id)?.length ?? 0, s.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('rejects an item for an unknown skill and an out-of-range answer', () => {
    const items = {
      version: 't',
      items: [
        { ...rawItems.items[0], id: 'x1', skillId: 'ghost' },
        { ...rawItems.items[0], id: 'x2', answer: 9 },
      ],
    }
    const result = validateContent({ skills: rawSkills, items, cards: rawCards, achievements: rawAchievements })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toMatch(/x1: unknown skill "ghost"/)
    expect(result.errors.join(' ')).toMatch(/x2: answer 9 is out of range/)
  })

  it('rejects duplicate item ids', () => {
    const first = rawItems.items[0]
    if (!first) throw new Error('no items')
    const items = { version: 't', items: [first, first] }
    const result = validateContent({ skills: rawSkills, items, cards: rawCards, achievements: rawAchievements })
    expect(result.ok).toBe(false)
  })
})
