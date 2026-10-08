import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { placeFromProfile } from '@/lib/academy/placement/seed'
import { backedSkillIds } from '@/lib/resume/readiness'
import { readStoredProfile } from '@/lib/resume/service'
import type { ResumeProfile } from '@/lib/resume/types'
import { cleanTerm } from './match'

/**
 * Suggested watch terms. From the CV, only skills backed by ready evidence
 * (lib/resume/readiness.ts: marked interview-ready, or named by a fully
 * ready item), so nothing the user cannot yet defend is echoed back. From
 * the Playground, the skill-graph names of the study targets (never the
 * user's own item labels or notes). Suggestions only: the user adds them.
 */

export interface WatchSuggestion {
  term: string
  reason: 'cv' | 'playground'
}

export const MAX_SUGGESTIONS = 12

export function suggestWatches(input: {
  cvSkills: readonly string[]
  academySkills: readonly string[]
  existing: readonly string[]
}): WatchSuggestion[] {
  const seen = new Set(input.existing.map((t) => cleanTerm(t).toLowerCase()))
  const out: WatchSuggestion[] = []
  const add = (raw: string, reason: WatchSuggestion['reason']): void => {
    const term = cleanTerm(raw)
    const key = term.toLowerCase()
    if (!term || term.length > 80 || seen.has(key)) return
    seen.add(key)
    out.push({ term, reason })
  }
  for (const s of input.cvSkills) add(s, 'cv')
  for (const s of input.academySkills) add(s, 'playground')
  return out.slice(0, MAX_SUGGESTIONS)
}

/** Names of the CV skills backed by ready evidence. */
export function readyCvSkills(profile: ResumeProfile): string[] {
  const backed = backedSkillIds(profile)
  return profile.skills.flatMap((g) => g.skills.filter((s) => backed.has(s.id)).map((s) => s.name))
}

export async function loadWatchSuggestions(userId: string, existing: readonly string[]): Promise<WatchSuggestion[]> {
  const profile = await readStoredProfile(userId)
  if (!profile) return []
  const content = loadAcademyContent()
  const targets = placeFromProfile(profile, content.graph).studyTargets
  const academySkills = [...new Set(targets.map((t) => content.graph.byId.get(t.skillId)?.name).filter((n): n is string => !!n))]
  return suggestWatches({ cvSkills: readyCvSkills(profile), academySkills, existing })
}
