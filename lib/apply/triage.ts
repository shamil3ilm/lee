import * as discQ from '@/lib/db/queries/discoveries'
import * as shortlistQ from '@/lib/db/queries/shortlist'
import * as feedbackQ from '@/lib/db/queries/discoveryFeedback'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { classifyRole } from '@/lib/discovery/relevance/roles'
import { companyKeyOf, type DismissReason } from './feedback'

/**
 * Shortlist card actions other than Prepare. Both are reversible from
 * Discovery (Later → the Shortlisted column; Not for me → Dismissed, with
 * Restore).
 */

export class TriageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TriageError'
  }
}

const OPEN = new Set(['new', 'shortlisted'])

/** "Later": keep it on the Discovery board's Shortlisted column and off today's list. */
export async function later(userId: string, discoveryId: string): Promise<void> {
  const disc = await discQ.getById(userId, discoveryId)
  if (!disc) throw new TriageError('Posting not found.')
  if (disc.status === 'new') await discQ.setStatus(userId, discoveryId, 'shortlisted')
  await shortlistQ.setState(userId, [discoveryId], 'later')
}

interface NormalizedLite {
  title?: string
  companyName?: string
  companyDomain?: string
  applyUrl?: string
  techStack?: string[]
}

/**
 * "Not for me" with a reason: the posting is dismissed (with the implicit
 * "dismissed" rating on its scoring call, as the inbox does), and the reason
 * is stored by role family / region / company so similar postings rank
 * lower and repeated reasons become preference suggestions.
 */
export async function notForMe(userId: string, discoveryId: string, reason: DismissReason): Promise<void> {
  const disc = await discQ.getById(userId, discoveryId)
  if (!disc) throw new TriageError('Posting not found.')
  const job = (disc.normalized ?? {}) as NormalizedLite
  const families = classifyRole({ title: job.title ?? '', techStack: job.techStack ?? [] }).families
  await feedbackQ.record(userId, discoveryId, reason, {
    roleFamily: families[0] ?? null,
    region: disc.regions.find((r) => r !== 'remote') ?? disc.regions[0] ?? null,
    companyKey: companyKeyOf({ companyDomain: job.companyDomain, companyName: job.companyName }),
  })
  if (OPEN.has(disc.status)) {
    await discQ.setStatus(userId, discoveryId, 'dismissed')
    if (disc.scoredByCallId) await aiCallLogsQ.updateAction(userId, disc.scoredByCallId, 'dismissed')
  }
  await shortlistQ.setState(userId, [discoveryId], 'dismissed')
}
