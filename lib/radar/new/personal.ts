import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { placeFromProfile } from '@/lib/academy/placement/seed'
import * as profileQ from '@/lib/db/queries/profile'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { readStoredProfile } from '@/lib/resume/service'
import { readyCvSkills } from '../suggest'
import { cleanProjectIds, deriveReleaseProjects } from './projects'
import { buildRelevanceTopics, type RelevanceTopic } from './relevance'

/**
 * One user's personal context for "what's new": what their ranking boosts
 * and which releases they follow. Read from the master profile at request
 * time — ready skills only (lib/resume/readiness.ts), the skill-graph
 * names of the Playground study targets (never the user's own labels or
 * notes), the search preferences' role families — and never stored with
 * the shared rows.
 */

export interface PersonalContext {
  readySkills: string[]
  studySkills: string[]
  roleFamilies: string[]
  releaseProjects: string[]
  /** True while the release list is the derived default (not edited). */
  releaseProjectsDerived: boolean
  topics: RelevanceTopic[]
}

export async function loadPersonalContext(userId: string): Promise<PersonalContext> {
  const row = await profileQ.get(userId)
  const profile = await readStoredProfile(userId, row)
  const readySkills = profile ? readyCvSkills(profile) : []
  let studySkills: string[] = []
  if (profile) {
    const content = loadAcademyContent()
    const targets = placeFromProfile(profile, content.graph).studyTargets
    studySkills = [...new Set(targets.map((t) => content.graph.byId.get(t.skillId)?.name).filter((n): n is string => !!n))]
  }
  const roleFamilies = row ? searchPrefsFromProfile(row).roleFamilies : []
  const stored = row?.radarReleaseProjects ?? null
  const releaseProjects = stored ? cleanProjectIds(stored) : deriveReleaseProjects({ readySkills, studySkills, roleFamilies })
  return {
    readySkills,
    studySkills,
    roleFamilies,
    releaseProjects,
    releaseProjectsDerived: stored === null,
    topics: buildRelevanceTopics({ readySkills, studySkills, roleFamilies, releaseProjects }),
  }
}
