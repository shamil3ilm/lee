import { describe, expect, it } from 'vitest'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { buildPlan, mergePlans, planSignature } from '@/lib/academy/selector/plan'
import { chooseItem } from '@/lib/academy/selector/choose-item'
import { domainsForStage } from '@/lib/academy/selector/interviews'
import { chooseDiagnosticDomains, nextDiagnosticItem, DIAGNOSTIC_PER_DOMAIN } from '@/lib/academy/placement/diagnostic'
import { expectedScore } from '@/lib/academy/rating'
import type { PlanInputs, SkillState } from '@/lib/academy/selector/types'
import type { StudyTarget } from '@/lib/academy/placement/study'

const content = loadAcademyContent()
const NOW = new Date('2026-10-06T08:00:00Z')

function state(skillId: string, rating: number, extra: Partial<SkillState> = {}): SkillState {
  return { skillId, rating, deviation: 120, level: 3, attempts: 3, lastPracticedAt: NOW, ...extra }
}

function inputs(over: Partial<PlanInputs> = {}): PlanInputs {
  return {
    content,
    now: NOW,
    today: '2026-10-06',
    timeBudgetMin: 30,
    mode: 'balanced',
    ratings: new Map(),
    dueReviews: 0,
    interviews: [],
    studyTargets: [],
    recentItemIds: [],
    placement: { done: true, remaining: 0 },
    ...over,
  }
}

function target(skillId: string, label: string, targetDate = ''): StudyTarget {
  return { skillId, studyItemId: `sk-${skillId}`, label, context: 'Learning', depth: 'learning', notes: '', targetDate }
}

describe('item choice', () => {
  it('aims at ~70% expected success', () => {
    const item = chooseItem(content, 'sql-querying', 1500, [])
    expect(item).not.toBeNull()
    const others = content.itemsBySkill.get('sql-querying')!
    const best = Math.min(...others.map((i) => Math.abs(expectedScore(1500, i.difficulty) - 0.7)))
    expect(Math.abs(expectedScore(1500, item!.difficulty) - 0.7)).toBeCloseTo(best, 6)
  })

  it('avoids repeating a recent item when another exists', () => {
    const first = chooseItem(content, 'sql-querying', 1500, [])!
    const second = chooseItem(content, 'sql-querying', 1500, [first.id])!
    expect(second.id).not.toBe(first.id)
  })

  it('returns null for an unknown skill', () => {
    expect(chooseItem(content, 'ghost', 1500, [])).toBeNull()
  })
})

describe('interview stage mapping (spec §9)', () => {
  it('maps stage kinds to skill domains', () => {
    expect(domainsForStage('system_design')).toEqual(['system_design', 'performance'])
    expect(domainsForStage('live_coding')).toEqual(['foundations', 'languages'])
    expect(domainsForStage('tech_screen')).toEqual(['foundations', 'data'])
    expect(domainsForStage('technical')).toEqual(['foundations', 'data', 'languages'])
    expect(domainsForStage('mystery')).toEqual([])
  })
})

describe('daily plan', () => {
  it('every item records at least one reason', () => {
    const plan = buildPlan(
      inputs({
        ratings: new Map([
          ['sql-querying', state('sql-querying', 1250, { level: 2 })],
          ['go', state('go', 1650, { level: 4 })],
        ]),
        dueReviews: 4,
        studyTargets: [target('rust', 'Rust', '2026-10-20')],
        interviews: [{ stageId: 's1', kind: 'system_design', title: 'Webhooks', company: 'Example Co', scheduledAt: new Date('2026-10-08T09:00:00Z') }],
      }),
    )
    expect(plan.items.length).toBeGreaterThan(2)
    for (const item of plan.items) {
      expect(item.reasons.length, item.id).toBeGreaterThan(0)
      expect(item.reasons[0]!.text.length).toBeGreaterThan(10)
    }
  })

  it('puts due reviews and the upcoming interview first, then study targets by date', () => {
    const plan = buildPlan(
      inputs({
        timeBudgetMin: 60,
        dueReviews: 3,
        studyTargets: [target('rust', 'Rust', '2026-11-30'), target('dns', 'DNS', '2026-10-10'), target('go', 'Go')],
        interviews: [{ stageId: 's1', kind: 'system_design', title: 'Design', company: 'Example Co', scheduledAt: new Date('2026-10-08T09:00:00Z') }],
      }),
    )
    const kinds = plan.items.map((i) => i.kind)
    expect(kinds[0]).toBe('review')
    expect(kinds[1]).toBe('interview')
    const interview = plan.items[1]!
    expect(['system_design', 'performance']).toContain(content.graph.byId.get(interview.skillId!)!.domain)
    expect(interview.reasons[0]!.code).toBe('interview')
    expect(interview.reasons[0]!.text).toMatch(/System design interview at Example Co in 2 days/)
    const study = plan.items.filter((i) => i.kind === 'study').map((i) => i.skillId)
    expect(study.slice(0, 2)).toEqual(['dns', 'rust'])
    expect(plan.items.find((i) => i.skillId === 'dns')!.reasons[0]!.text).toMatch(/study list.*DNS.*Oct 10/)
  })

  it('ignores interviews more than 7 days out', () => {
    const plan = buildPlan(
      inputs({ interviews: [{ stageId: 's1', kind: 'system_design', title: '', company: 'X', scheduledAt: new Date('2026-10-20T09:00:00Z') }] }),
    )
    expect(plan.items.some((i) => i.kind === 'interview')).toBe(false)
  })

  it('targets the weakest skill and stretches a strong one', () => {
    const plan = buildPlan(
      inputs({
        ratings: new Map([
          ['sql-querying', state('sql-querying', 1250, { level: 2 })],
          ['caching', state('caching', 1500)],
          ['go', state('go', 1700, { level: 4 })],
        ]),
      }),
    )
    const weak = plan.items.find((i) => i.kind === 'weakness')
    expect(weak?.skillId).toBe('sql-querying')
    expect(weak?.reasons[0]?.text).toMatch(/Weak spot: SQL querying is Beginner/)
    expect(plan.items.some((i) => i.kind === 'stretch')).toBe(true)
  })

  it('offers the placement check until it is done', () => {
    const plan = buildPlan(inputs({ placement: { done: false, remaining: 12 } }))
    expect(plan.items[0]?.kind).toBe('placement')
    expect(plan.items[0]?.reasons[0]?.code).toBe('placement')
  })

  it('respects the time budget and the mode cap, but always offers one item', () => {
    const ratings = new Map(content.graph.skills.slice(0, 10).map((s, i) => [s.id, state(s.id, 1250 + i * 40)]))
    const quick = buildPlan(inputs({ ratings, mode: 'quick', timeBudgetMin: 60, dueReviews: 2 }))
    expect(quick.items.length).toBeLessThanOrEqual(3)
    const tiny = buildPlan(inputs({ ratings, timeBudgetMin: 1 }))
    expect(tiny.items.length).toBe(1)
    const roomy = buildPlan(inputs({ ratings, timeBudgetMin: 15 }))
    expect(roomy.items.reduce((m, i) => m + i.minutes, 0)).toBeLessThanOrEqual(15)
  })

  it('never puts the same skill twice', () => {
    const plan = buildPlan(
      inputs({
        timeBudgetMin: 60,
        ratings: new Map([['dns', state('dns', 1250, { level: 2 })]]),
        studyTargets: [target('dns', 'DNS', '2026-10-10')],
      }),
    )
    const skills = plan.items.map((i) => i.skillId).filter(Boolean)
    expect(new Set(skills).size).toBe(skills.length)
  })

  it('a signature change regenerates, keeping finished items', () => {
    const a = buildPlan(inputs({ dueReviews: 2 }))
    const done = { ...a, items: a.items.map((i, n) => (n === 0 ? { ...i, status: 'done' as const, attemptId: 'x' } : i)) }
    const b = buildPlan(inputs({ dueReviews: 0, studyTargets: [target('go', 'Go')] }))
    expect(planSignature(inputs({ dueReviews: 2 }))).not.toBe(planSignature(inputs({ dueReviews: 0 })))
    const merged = mergePlans(done.items, b.items)
    expect(merged.find((i) => i.id === a.items[0]!.id)?.status).toBe('done')
    expect(merged.some((i) => i.skillId === 'go')).toBe(true)
  })
})

describe('placement diagnostic', () => {
  it('prefers domains with profile evidence, study targets and interviews, capped', () => {
    const domains = chooseDiagnosticDomains(content.graph, { skillIds: ['go', 'dns'], interviewDomains: ['system_design'] })
    expect(domains.slice(0, 3)).toEqual(['system_design', 'languages', 'servers'])
    expect(domains.length).toBeLessThanOrEqual(6)
  })

  it('walks each chosen domain with a few items near 50% success, then stops', () => {
    const domains = ['servers', 'data']
    const ratings = new Map<string, SkillState>()
    const done: Array<{ itemId: string; skillId: string }> = []
    for (let i = 0; i < domains.length * DIAGNOSTIC_PER_DOMAIN; i++) {
      const next = nextDiagnosticItem(content, domains, ratings, done)
      expect(next).not.toBeNull()
      expect(domains).toContain(content.graph.byId.get(next!.item.skillId)!.domain)
      done.push({ itemId: next!.item.id, skillId: next!.item.skillId })
    }
    expect(new Set(done.map((d) => d.itemId)).size).toBe(done.length)
    expect(nextDiagnosticItem(content, domains, ratings, done)).toBeNull()
  })
})
