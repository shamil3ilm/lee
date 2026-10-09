/** Client-safe shapes for LinkedIn hiring posts. */

export type PostVia = 'email' | 'paste' | 'capture'

export interface PostContactView {
  emails: string[]
  dm: boolean
  applyLinks: string[]
  chat: boolean
}

/**
 * Stored on a `linkedin_post` discovery as `normalized.post`: who posted,
 * what the post said (a ≤ 1 KB snippet) and how to respond. Only what the
 * user's own email showed or the user pasted; nothing is looked up.
 */
export interface LinkedInPostMeta {
  via: PostVia
  /** Canonical post link (feed URN or /posts/ slug), never fetched; null when only text was pasted. */
  postUrl: string | null
  posterName: string | null
  posterHeadline: string | null
  /** Profile link from the email or the paste only. */
  posterUrl: string | null
  snippet: string
  contact: PostContactView
  /** Why it reads as a hiring post (classifier labels). */
  reasons: string[]
  hiring: boolean
}

/** A pasted / captured post, shown for review before it becomes a discovery. */
export interface PostCandidate {
  via: 'paste' | 'capture'
  /** Post text as pasted (capped); '' when only a link was pasted. */
  text: string
  postUrl: string | null
  /** Only a post link was pasted: lee stores the link and asks for the text. */
  linkOnly: boolean
  posterName: string
  posterHeadline: string
  posterUrl: string | null
  role: string
  company: string
  location: string | null
  contact: PostContactView
  hiring: boolean
  reasons: string[]
  negatives: string[]
  /** Scam Shield on the post text: null when nothing to say. */
  risk: { level: string; labels: string[] } | null
}

export const LINKEDIN_POST_KIND = 'linkedin_post'
export const LINKEDIN_POST_SOURCE_NAME = 'LinkedIn posts'
/** The source chip on Discovery. */
export const LINKEDIN_POST_LABEL = 'LinkedIn post'
/** `applications.source` for a tracked hiring post. */
export const LINKEDIN_POST_APP_SOURCE = 'linkedin_hiring_post'
/** Placeholder employer when the post names none. */
export const UNNAMED_COMPANY = 'Company not named (LinkedIn post)'

/** What a Discovery card shows for a hiring post (no snippet: the card links to the post). */
export interface PostRowView {
  posterName: string | null
  posterHeadline: string | null
  posterUrl: string | null
  postUrl: string | null
  email: string | null
  dm: boolean
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

function linkedInHttps(v: unknown): string | null {
  const s = str(v, 2_000)
  return s && /^https:\/\/(?:[a-z0-9-]+\.)*linkedin\.com\//i.test(s) ? s : null
}

/** `normalized.post` (untyped jsonb) → the card's view, or null for other rows. */
export function toPostRowView(raw: unknown): PostRowView | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const contact = (p.contact && typeof p.contact === 'object' ? p.contact : {}) as Record<string, unknown>
  const emails = Array.isArray(contact.emails) ? contact.emails.filter((e): e is string => typeof e === 'string') : []
  return {
    posterName: str(p.posterName, 120),
    posterHeadline: str(p.posterHeadline, 200),
    posterUrl: linkedInHttps(p.posterUrl),
    postUrl: linkedInHttps(p.postUrl),
    email: emails[0] ?? null,
    dm: contact.dm === true,
  }
}
