import * as repoQ from '@/lib/db/queries/githubRepoStats'
import * as batchesQ from '@/lib/db/queries/importBatches'
import * as compareQ from '@/lib/db/queries/jobComparison'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as profileQ from '@/lib/db/queries/profile'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import type { UserProfile } from '@/lib/db/queries/profile'
import * as variantQ from '@/lib/db/queries/variantReset'
import { mergeIntentions, pendingIntentions, readIntentions, type ReadinessIntention } from '@/lib/import/intentions'
import { canEditPublicFacts } from '@/lib/portfolio/lock'
import { parseOrphans } from '@/lib/portfolio/overlay'
import { readProfileLinks, type ProfileLink } from '@/lib/profile/links'
import { readResumeProfile, type ResumeProfile } from '@/lib/resume/types'

/**
 * SERVER-ONLY. Everything Reset details needs to count, preview, back up
 * and apply, loaded once. Applications, documents, tailored CVs and
 * discoveries are deliberately not loaded: Reset never touches them.
 */

export interface ResetState {
  editable: boolean
  row: UserProfile | null
  resume: ResumeProfile | null
  links: ProfileLink[]
  batches: batchesQ.ImportBatchRow[]
  /** Readiness choices from imports still waiting for their item (lib/import/intentions.ts). */
  intentions: ReadinessIntention[]
  /** Readiness intentions whose item is not in the profile. */
  orphanIntentions: ReadinessIntention[]
  /** Overlay of items the portfolio removed (lib/portfolio/overlay.ts). */
  portfolioOrphans: number
  /** Repo links (Settings › Résumé › From GitHub) to a project that is gone. */
  orphanRepoLinks: string[]
  variants: variantQ.VariantRow[]
  usedVariantIds: Set<string>
  connections: number
  currentJob: unknown
  narratives: unknown
}

export async function loadResetState(userId: string): Promise<ResetState> {
  const [row, batches, variants, used, connections, compare, repos, publish, editable] = await Promise.all([
    profileQ.get(userId),
    batchesQ.listActive(userId, 50),
    variantQ.listAll(userId),
    variantQ.usedVariantIds(userId),
    linkedinQ.countConnections(userId),
    compareQ.get(userId),
    repoQ.list(userId),
    publishQ.get(userId),
    canEditPublicFacts(userId),
  ])
  const resume = readResumeProfile(row?.resume)
  const intentions = mergeIntentions(...[...batches].reverse().map((b) => readIntentions(b.intentions)))
  const projectIds = new Set((resume?.projects ?? []).map((p) => p.id))
  return {
    editable,
    row,
    resume,
    links: readProfileLinks(row?.links),
    batches,
    intentions,
    orphanIntentions: resume ? pendingIntentions(resume, intentions) : intentions,
    portfolioOrphans: parseOrphans(publish?.orphans).length,
    orphanRepoLinks: repos.filter((r) => r.linkedProjectId && !projectIds.has(r.linkedProjectId)).map((r) => r.fullName),
    variants,
    usedVariantIds: used,
    connections,
    currentJob: compare.currentJob,
    narratives: compare.narratives,
  }
}
