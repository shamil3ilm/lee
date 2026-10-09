import { createHash } from 'node:crypto'
import type { DiscoveryItem, NormalizedJob } from '@/lib/discovery/adapters/types'
import { classifyHiringPost, normalizePostText, type HiringVerdict } from './classify'
import { extractPostFacts, type PostFacts } from './extract'
import { capBytes } from './snippet'
import { UNNAMED_COMPANY, type LinkedInPostMeta, type PostVia } from './types'

/**
 * One LinkedIn post (from a notification email, a paste or the "Send to
 * lee" bookmarklet) → the classifier verdict, the extracted facts and the
 * discovery item. The item is deliberately "title only": the post text is
 * kept as a capped snippet on `normalized.post` (read by Scam Shield), not
 * as a job description, so the Match Score says "Low confidence" and the
 * card offers "Paste the JD".
 */

export interface PostInput {
  via: PostVia
  /** Canonical post link + dedupe key, when known. */
  link: { key: string; url: string } | null
  posterName: string | null
  posterHeadline: string | null
  posterUrl: string | null
  text: string
}

export interface HiringPost {
  verdict: HiringVerdict
  facts: PostFacts
  meta: LinkedInPostMeta
  /** Null when there is nothing to link the discovery to (no post link, apply link or address). */
  item: DiscoveryItem | null
}

function textKey(text: string): string {
  return `h-${createHash('sha256').update(normalizePostText(text)).digest('hex').slice(0, 24)}`
}

/** The link a discovery opens: the post, else an apply link, else the address in the post. */
export function linkFor(meta: Pick<LinkedInPostMeta, 'postUrl' | 'contact'>): string | null {
  return meta.postUrl ?? meta.contact.applyLinks[0] ?? (meta.contact.emails[0] ? `mailto:${meta.contact.emails[0]}` : null)
}

export function buildHiringPost(input: PostInput, receivedAt?: Date): HiringPost {
  const snippet = capBytes(input.text)
  const verdict = classifyHiringPost(snippet)
  const facts = extractPostFacts(snippet, { headline: input.posterHeadline })
  const meta: LinkedInPostMeta = {
    via: input.via,
    postUrl: input.link?.url ?? null,
    posterName: input.posterName,
    posterHeadline: input.posterHeadline,
    posterUrl: input.posterUrl,
    snippet,
    contact: facts.contact,
    reasons: verdict.reasons.slice(0, 5),
    hiring: verdict.hiring,
  }
  const applyUrl = linkFor(meta)
  if (!applyUrl) return { verdict, facts, meta, item: null }
  const key = input.link?.key ?? textKey(snippet)
  const raw = { via: input.via, key, postUrl: meta.postUrl, ...(receivedAt ? { receivedAt: receivedAt.toISOString() } : {}) }
  const normalized: NormalizedJob & { post: LinkedInPostMeta } = {
    kind: 'job',
    title: facts.role ?? (input.posterName ? `Hiring post by ${input.posterName}` : 'Hiring post'),
    companyName: facts.company ?? UNNAMED_COMPANY,
    ...(facts.companyDomain ? { companyDomain: facts.companyDomain } : {}),
    ...(facts.location ? { location: facts.location } : {}),
    remoteType: facts.remote,
    employmentType: 'unknown',
    // Title only on purpose: the snippet lives on `post`, Paste the JD fills the rest.
    descriptionMd: '',
    applyUrl,
    ...(receivedAt ? { postedAt: receivedAt } : {}),
    techStack: [],
    subSource: 'linkedin_post',
    tags: ['via:linkedin_post', `delivery:${input.via}`, verdict.hiring ? 'post:hiring' : 'post:unclear'],
    post: meta,
    raw,
  }
  return { verdict, facts, meta, item: { sourceItemId: `post:${key}`, raw, normalized } }
}
