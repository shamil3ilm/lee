import * as repoQ from '@/lib/db/queries/githubRepoStats'
import * as batchesQ from '@/lib/db/queries/importBatches'
import * as compareQ from '@/lib/db/queries/jobComparison'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as profileQ from '@/lib/db/queries/profile'
import type { UserProfile } from '@/lib/db/queries/profile'
import * as variantQ from '@/lib/db/queries/variantReset'
import { mergeIntentions, pendingIntentions, readIntentions, type ReadinessIntention } from '@/lib/import/intentions'
import { profileEditableInLee } from '@/lib/profile/edit-mode'
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
  /** Readiness intentions whose item is not in the profile. */
  orphanIntentions: ReadinessIntention[]
  /** Repo links (Settings › Résumé › From GitHub) to a project that is gone. */
  orphanRepoLinks: string[]
  variants: variantQ.VariantRow[]
  usedVariantIds: Set<string>
  connections: number
  currentJob: unknown
  narratives: unknown
}

export async function loadResetState(userId: string): Promise<ResetState> {
  const [row, batches, variants, used, connections, compare, repos] = await Promise.all([
    profileQ.get(userId),
    batchesQ.listActive(userId, 50),
    variantQ.listAll(userId),
    variantQ.usedVariantIds(userId),
    linkedinQ.countConnections(userId),
    compareQ.get(userId),
    repoQ.list(userId),
  ])
  const resume = readResumeProfile(row?.resume)
  const intentions = mergeIntentions(...[...batches].reverse().map((b) => readIntentions(b.intentions)))
  const projectIds = new Set((resume?.projects ?? []).map((p) => p.id))
  return {
    editable: profileEditableInLee(),
    row,
    resume,
    links: readProfileLinks(row?.links),
    batches,
    orphanIntentions: resume ? pendingIntentions(resume, intentions) : intentions,
    orphanRepoLinks: repos.filter((r) => r.linkedProjectId && !projectIds.has(r.linkedProjectId)).map((r) => r.fullName),
    variants,
    usedVariantIds: used,
    connections,
    currentJob: compare.currentJob,
    narratives: compare.narratives,
  }
}
