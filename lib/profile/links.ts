import { z } from 'zod'
import { findTerms, normalizeForMatch } from '@/lib/discovery/relevance/text'
import { SKILL_GROUPS } from '@/lib/discovery/relevance/roles'

/**
 * Labelled profile links (portfolio, case studies, GitHub, LinkedIn, résumé
 * page). Stored on `user_profile.links`; drafts suggest the relevant ones
 * for a job and the user confirms which to include.
 */

export const LINK_KINDS = ['portfolio', 'case_study', 'github', 'linkedin', 'resume', 'other'] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export const LINK_KIND_LABELS: Readonly<Record<LinkKind, string>> = {
  portfolio: 'Portfolio',
  case_study: 'Case study',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  resume: 'Résumé page',
  other: 'Other',
}

export const MAX_LINKS = 12

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v)
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch {
      return false
    }
  }, 'Use a full http(s) URL')

export const profileLinkSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  label: z.string().trim().min(1).max(80),
  url: httpUrl,
  kind: z.enum(LINK_KINDS),
})
export type ProfileLink = z.infer<typeof profileLinkSchema>

/** The kind a link gets by default from its address (the user may change it). */
export function inferLinkKind(url: string): LinkKind {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return 'other'
  }
  if (host === 'github.com') return 'github'
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin'
  return 'other'
}

/** Stored links, leniently: invalid entries are dropped. */
export function readProfileLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((v) => {
    const p = profileLinkSchema.safeParse(v)
    return p.success ? [p.data] : []
  }).slice(0, MAX_LINKS)
}

export interface LinkSuggestion {
  link: ProfileLink
  /** Why this link fits the job; empty for links not suggested. */
  reason: string | null
  suggested: boolean
}

/** Domain words that, shared by a link label and a job, make the link relevant. */
const DOMAIN_TERMS = [
  ...SKILL_GROUPS.payments,
  ...SKILL_GROUPS.einvoicing,
  ...SKILL_GROUPS.platform,
  ...SKILL_GROUPS.llm,
  ...SKILL_GROUPS.integrations,
  'webhooks', 'api', 'apis', 'laravel', 'php', 'react', 'next.js', 'typescript', 'fintech', 'saas',
]

/**
 * Rank the user's links for a job. Case studies and portfolio items whose
 * label shares a domain term with the job are suggested with the shared
 * term as the reason; GitHub and the portfolio are suggested for any
 * engineering job; LinkedIn and the résumé page only for outreach.
 */
export function suggestLinksForJob(
  links: readonly ProfileLink[],
  job: { title: string; description?: string | null },
  purpose: 'cover_letter' | 'outreach' = 'cover_letter',
): LinkSuggestion[] {
  const jobText = normalizeForMatch(`${job.title} ${(job.description ?? '').slice(0, 6_000)}`)
  const jobTerms = new Set(findTerms(jobText, DOMAIN_TERMS))
  const scored = links.map((link) => {
    const labelTerms = findTerms(normalizeForMatch(`${link.label} ${link.url}`), DOMAIN_TERMS)
    const shared = labelTerms.filter((t) => jobTerms.has(t))
    if (shared.length > 0) {
      return { link, reason: `Matches the job: ${shared.slice(0, 3).join(', ')}`, suggested: true, rank: 3 + shared.length }
    }
    if (link.kind === 'github' || link.kind === 'portfolio') {
      return { link, reason: 'Shows your code and projects', suggested: true, rank: 2 }
    }
    if (purpose === 'outreach' && (link.kind === 'linkedin' || link.kind === 'resume')) {
      return { link, reason: 'Lets them check your background quickly', suggested: true, rank: 1 }
    }
    return { link, reason: null, suggested: false, rank: 0 }
  })
  return scored.sort((a, b) => b.rank - a.rank).map(({ link, reason, suggested }) => ({ link, reason, suggested }))
}
