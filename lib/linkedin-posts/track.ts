import * as appsQ from '@/lib/db/queries/applications'
import * as contactsQ from '@/lib/db/queries/contacts'
import * as discQ from '@/lib/db/queries/discoveries'
import { markApplied } from '@/lib/apply/applied'
import { localDay } from '@/lib/apply/dates'
import { createContact, linkContactToApplication } from '@/lib/contacts/service'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { promoteJobDiscovery } from '@/lib/discovery/service'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { logger } from '@/lib/logger'

/**
 * SERVER-ONLY. "Track it" on a LinkedIn hiring post: the post becomes an
 * application with the source "LinkedIn post", the poster becomes a contact
 * (name and profile link from the email or paste only, role "Recruiter /
 * Hiring manager") linked as the recruiter, and, when the user says they
 * sent their reply, the application is marked applied today so the usual
 * follow-up nudges are scheduled (lib/followups/cadence.ts). Idempotent:
 * tracking an already-tracked post returns its application.
 */

export const POSTER_CONTACT_ROLE = 'Recruiter / Hiring manager'

export class TrackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrackError'
  }
}

export interface TrackResult {
  applicationId: string
  contactId: string | null
  followupDueAt: Date | null
  alreadyTracked: boolean
}

async function posterContact(userId: string, companyId: string | null, post: NonNullable<NormalizedJob['post']>): Promise<string | null> {
  if (!post.posterName) return null
  const existing = (await contactsQ.list(userId)).find(
    (c) => (post.posterUrl && c.linkedinUrl === post.posterUrl) || (c.name.toLowerCase() === post.posterName!.toLowerCase() && c.companyId === companyId),
  )
  if (existing) return existing.id
  const contact = await createContact({
    userId,
    companyId,
    name: post.posterName,
    linkedinUrl: post.posterUrl,
    role: POSTER_CONTACT_ROLE,
    notes: post.postUrl ? `From their LinkedIn hiring post: ${post.postUrl}` : 'From their LinkedIn hiring post.',
  })
  return contact.id
}

export async function trackHiringPost(userId: string, discoveryId: string, opts: { sent: boolean; now?: Date }): Promise<TrackResult> {
  const disc = await discQ.getById(userId, discoveryId)
  const post = (disc?.normalized as NormalizedJob | undefined)?.post
  if (!disc || !post) throw new TrackError('This is not a LinkedIn hiring post.')
  if (disc.savedApplicationId) {
    return { applicationId: disc.savedApplicationId, contactId: null, followupDueAt: null, alreadyTracked: true }
  }
  if (disc.status === 'dismissed') throw new TrackError('Restore the post before tracking it.')
  const { application } = await promoteJobDiscovery({ userId, discoveryId })
  const app = await appsQ.getById(userId, application.id)
  const contactId = await posterContact(userId, app?.job.company?.id ?? null, post)
  if (contactId) await linkContactToApplication({ userId, applicationId: application.id, contactId, role: 'recruiter' })
  let followupDueAt: Date | null = null
  if (opts.sent) {
    const now = opts.now ?? new Date()
    const r = await markApplied(userId, application.id, localDay(now, await getUserTimeZone(userId)), now)
    followupDueAt = r.followupDueAt
  }
  logger.info('linkedin_post_tracked', { userId, sent: opts.sent, contact: Boolean(contactId) })
  return { applicationId: application.id, contactId, followupDueAt, alreadyTracked: false }
}
