import * as profileQ from '@/lib/db/queries/profile'
import * as publishQ from '@/lib/db/queries/portfolioPublish'
import { shortDateTime } from '@/lib/ui/date'
import { isConfigured } from './config'
import type { SectionDiff } from './diff'
import { parseOrphans, type OrphanOverlay } from './overlay'
import { portfolioEditUrl, profileEditableInLee } from './sync-flags'

/** SERVER-ONLY. What the sync line, the lock banner and Settings › Portfolio show. */

export interface SyncStatus {
  /** A repository is configured (else only the site fallback can be used). */
  repoConfigured: boolean
  /** Public facts are read-only in lee (synced, PROFILE_EDIT_IN_LEE off). */
  locked: boolean
  /** "Oct 9, 3:40 PM" in the user's timezone; null before the first pull. */
  pulledLabel: string | null
  source: 'github' | 'site' | null
  /** Why the last check failed (user-facing), null when it worked. */
  error: string | null
  /** GitHub's web editor for profile.json; null without a repository. */
  editUrl: string | null
  lastDiff: SectionDiff[]
  orphans: OrphanOverlay[]
}

function parseDiff(value: unknown): SectionDiff[] {
  return Array.isArray(value)
    ? value.filter((d): d is SectionDiff => typeof d === 'object' && d !== null && typeof (d as SectionDiff).section === 'string' && Array.isArray((d as SectionDiff).changes))
    : []
}

export async function loadSyncStatus(userId: string): Promise<SyncStatus> {
  const [state, row] = await Promise.all([publishQ.get(userId), profileQ.get(userId)])
  const config = state ? { repo: state.repo, branch: state.branch, path: state.path } : null
  const repoConfigured = config !== null && isConfigured(config)
  return {
    repoConfigured,
    locked: !profileEditableInLee() && Boolean(state?.pulledSha),
    pulledLabel: state?.pulledAt ? shortDateTime(state.pulledAt, row?.timezone) : null,
    source: state?.pullSource === 'github' || state?.pullSource === 'site' ? state.pullSource : null,
    error: state?.pullError ?? null,
    editUrl: repoConfigured ? portfolioEditUrl(config) : null,
    lastDiff: parseDiff(state?.lastPullDiff),
    orphans: parseOrphans(state?.orphans),
  }
}
