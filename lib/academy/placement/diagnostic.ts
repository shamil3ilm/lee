import type { AcademyContent } from '@/lib/academy/content/catalog'
import type { SkillGraph } from '@/lib/academy/content/graph'
import type { Item } from '@/lib/academy/content/schema'
import { DEFAULT_DEVIATION, DEFAULT_RATING } from '@/lib/academy/rating'
import { chooseItem, DIAGNOSTIC_SUCCESS } from '@/lib/academy/selector/choose-item'
import type { SkillState } from '@/lib/academy/selector/types'

/**
 * The short placement diagnostic (v13 §3.2): a few items per domain,
 * each aimed at ~50% success for the skill's current estimate, so every
 * answer moves the (uncertain) rating like a binary search. Seeds from the
 * profile are the starting point; these attempts adjust them. Pure.
 */

export const DIAGNOSTIC_PER_DOMAIN = 2
export const MAX_DIAGNOSTIC_DOMAINS = 6
/** Default domains when the profile and journey give no hint. */
const DEFAULT_ORDER = ['foundations', 'data', 'backend', 'languages', 'system_design', 'concurrency']

/** Interview domains first, then the domains of evidence/study skills, then defaults. */
export function chooseDiagnosticDomains(
  graph: SkillGraph,
  hints: { skillIds: readonly string[]; interviewDomains: readonly string[] },
): string[] {
  const ordered = [
    ...hints.interviewDomains,
    ...hints.skillIds.map((id) => graph.byId.get(id)?.domain ?? ''),
    ...DEFAULT_ORDER,
    ...graph.domains.map((d) => d.id),
  ]
  const out: string[] = []
  for (const d of ordered) {
    if (d && graph.domainById.has(d) && !out.includes(d)) out.push(d)
    if (out.length >= MAX_DIAGNOSTIC_DOMAINS) break
  }
  return out
}

export interface DiagnosticStep {
  item: Item
  domain: string
  /** Items left after this one. */
  remaining: number
}

export interface DiagnosticDone {
  itemId: string
  skillId: string
}

function remainingCount(graph: SkillGraph, domains: readonly string[], done: readonly DiagnosticDone[]): number {
  return domains.reduce((sum, d) => {
    const n = done.filter((x) => graph.byId.get(x.skillId)?.domain === d).length
    return sum + Math.max(0, DIAGNOSTIC_PER_DOMAIN - n)
  }, 0)
}

export function diagnosticRemaining(content: AcademyContent, domains: readonly string[], done: readonly DiagnosticDone[]): number {
  return remainingCount(content.graph, domains, done)
}

export function nextDiagnosticItem(
  content: AcademyContent,
  domains: readonly string[],
  ratings: ReadonlyMap<string, SkillState>,
  done: readonly DiagnosticDone[],
): DiagnosticStep | null {
  const { graph } = content
  const usedItems = new Set(done.map((d) => d.itemId))
  const usedSkills = new Set(done.map((d) => d.skillId))
  for (const domain of domains) {
    const count = done.filter((x) => graph.byId.get(x.skillId)?.domain === domain).length
    if (count >= DIAGNOSTIC_PER_DOMAIN) continue
    // The least certain skill not probed yet in this run.
    const skills = graph.skills
      .filter((s) => s.domain === domain && content.itemsBySkill.has(s.id) && !usedSkills.has(s.id))
      .map((s) => ratings.get(s.id) ?? { skillId: s.id, rating: DEFAULT_RATING, deviation: DEFAULT_DEVIATION })
      .sort((a, b) => b.deviation - a.deviation)
    for (const s of skills) {
      const item = chooseItem(content, s.skillId, s.rating, [], DIAGNOSTIC_SUCCESS, usedItems)
      if (item) return { item, domain, remaining: remainingCount(graph, domains, done) - 1 }
    }
  }
  return null
}
