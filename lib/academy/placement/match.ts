import { findTerms, normalizeForMatch } from '@/lib/discovery/relevance/text'
import type { SkillGraph } from '@/lib/academy/content/graph'

/**
 * Which graph skills a piece of the profile talks about. Names and keywords
 * match a skill's `aliases` exactly ("Go" is Go, "go live" is not); free
 * text matches only the longer, unambiguous `textAliases` as whole words.
 * Pure.
 */

export interface MatchInput {
  /** Skill names and keywords: exact alias match. */
  terms: readonly string[]
  /** Highlight / description text: whole-word textAlias match. */
  text: string
}

export function matchSkills(graph: SkillGraph, input: MatchInput): string[] {
  const terms = new Set(input.terms.map((t) => normalizeForMatch(t)).filter(Boolean))
  const text = normalizeForMatch(input.text)
  const out: string[] = []
  for (const skill of graph.skills) {
    const exact = skill.aliases.some((a) => terms.has(normalizeForMatch(a)))
    const inText = text.length > 0 && findTerms(text, skill.textAliases).length > 0
    if (exact || inText) out.push(skill.id)
  }
  return out
}
