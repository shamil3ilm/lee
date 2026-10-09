import * as discQ from '@/lib/db/queries/discoveries'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as profileQ from '@/lib/db/queries/profile'
import type { AIProvider } from '@/lib/ai/types'
import { getMasterCV } from '@/lib/documents/master'
import type { MasterCV } from '@/lib/documents/types'
import { loadApplicationFacts } from '@/lib/apply/application-facts-service'
import { highlightBullet } from '@/lib/company-discovery/reach-out'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { normalizeForMatch } from '@/lib/discovery/relevance/text'
import { referralHint, type ReferralHint } from '@/lib/integrations/linkedin/connections'
import { variantSummaries } from '@/lib/variants/service'
import { jobSignals, suggestVariant } from '@/lib/variants/suggest'
import { logger } from '@/lib/logger'
import { lockedReply, type ReplyChannel, type ReplyDraft, type ReplyFacts } from './draft'
import { UNNAMED_COMPANY } from './types'

/**
 * SERVER-ONLY. "Reply" on a LinkedIn hiring post: gather the facts (the
 * post, the master CV, the best résumé variant for the post's region and
 * role, the opted-in region facts), draft with the AI when one is set up,
 * fact-lock the result (else the template) and add the referral hint (the
 * poster or someone at the company among the user's imported connections).
 * The user copies and sends it: lee never sends LinkedIn messages.
 */

export class ReplyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReplyError'
  }
}

export interface ReplyPlan {
  draft: ReplyDraft
  /** Best résumé variant to attach, with why. */
  variant: { id: string; name: string; reason: string } | null
  referral: ReferralHint | null
  /** The poster is one of the user's connections (by name). */
  posterIsConnection: boolean
  posterUrl: string | null
  email: string | null
}

/** Ready CV skills the post names first, then the other ready ones; at most 5, verbatim. */
export function skillsForPost(master: MasterCV, readySkills: readonly string[], postText: string): string[] {
  const ready = new Set(readySkills.map((s) => normalizeForMatch(s)))
  const post = ` ${normalizeForMatch(postText)} `
  const all = [...master.skills.primary, ...(master.skills.secondary ?? [])].filter((s) => ready.size === 0 || ready.has(normalizeForMatch(s)))
  const named = all.filter((s) => post.includes(` ${normalizeForMatch(s)} `))
  return [...new Set([...named, ...all])].slice(0, 5)
}

export async function draftPostReply(
  userId: string,
  discoveryId: string,
  opts: { channel?: ReplyChannel; ai?: AIProvider | null } = {},
): Promise<ReplyPlan> {
  const row = await discQ.getById(userId, discoveryId)
  const job = row?.normalized as NormalizedJob | undefined
  const post = job?.post
  if (!job || !post) throw new ReplyError('This is not a LinkedIn hiring post.')
  const master = await getMasterCV(userId)
  if (!master) throw new ReplyError('Add your CV in Résumé first: the reply is built only from it.')
  const prefs = searchPrefsFromProfile(await profileQ.get(userId))
  const email = post.contact.emails[0] ?? null
  const channel: ReplyChannel = opts.channel === 'email' && email ? 'email' : opts.channel ?? (email && !post.contact.dm ? 'email' : 'linkedin')
  const company = job.companyName && job.companyName !== UNNAMED_COMPANY ? job.companyName : null
  const role = job.title && !/^(?:Hiring post|LinkedIn post)/.test(job.title) ? job.title : null
  const skills = skillsForPost(master, prefs.readySkills, `${job.title}\n${post.snippet}`)
  const signals = jobSignals({ title: job.title, location: job.location, descriptionMd: post.snippet })
  const suggestion = suggestVariant(await variantSummaries(userId), signals)
  const latest = master.experience[0]
  const facts: ReplyFacts = {
    channel,
    post: { posterName: post.posterName, role, company, location: job.location ?? null, snippet: post.snippet, email: channel === 'email' ? email : null },
    candidate: {
      name: master.basics.name,
      headline: master.basics.headline,
      skills,
      highlight: highlightBullet(master, skills),
      currentRole: latest ? `${latest.role} at ${latest.company}` : null,
      variantName: suggestion.variant?.name ?? null,
    },
    regionFacts: job.location ? await loadApplicationFacts(userId, { title: job.title, location: job.location }) : null,
  }
  let ai: { subject?: string | null; body: string } | null = null
  if (opts.ai?.draftPostReply) {
    try {
      ai = await opts.ai.draftPostReply(facts, { userId })
    } catch (e) {
      logger.warn('linkedin_post_reply_ai_failed', { userId, err: e instanceof Error ? e.name : 'unknown' })
    }
  }
  const draft = lockedReply(facts, ai)
  if (draft.rejected) logger.info('linkedin_post_reply_fact_lock', { userId, rejected: draft.rejected.length })
  const [referral, byName] = await Promise.all([
    referralHint(userId, company).catch(() => null),
    post.posterName ? linkedinQ.byName(userId, post.posterName).catch(() => []) : Promise.resolve([]),
  ])
  return {
    draft,
    variant: suggestion.variant ? { id: suggestion.variant.id, name: suggestion.variant.name, reason: suggestion.reason } : null,
    referral,
    posterIsConnection: byName.length > 0,
    posterUrl: post.posterUrl,
    email,
  }
}
