import type { ApplicationFacts } from '@/lib/ai/prompts/application-facts'
import { factLockAgainst } from '@/lib/company-discovery/outreach'

/**
 * The reply to a LinkedIn hiring post: a short, region-aware message to the
 * poster (a LinkedIn DM the user sends themselves) or an email when the post
 * lists an address. FACT-LOCKED: every fact comes from `ReplyFacts` (the
 * post as the user's email showed it or the user pasted it, the master CV
 * and the chosen résumé variant, the opted-in region facts). An AI rewrite
 * is kept only when the fact lock finds nothing outside them; otherwise the
 * deterministic template is used. lee never sends it. Pure, client-safe.
 */

export type ReplyChannel = 'linkedin' | 'email'

export interface ReplyFacts {
  channel: ReplyChannel
  post: {
    posterName: string | null
    role: string | null
    company: string | null
    location: string | null
    /** The post text (≤ 1 KB). */
    snippet: string
    /** The address the post lists, for the email channel. */
    email: string | null
  }
  candidate: {
    name: string
    headline: string
    /** Ready skills the post names first, then other ready CV skills (≤ 5). */
    skills: string[]
    /** One real CV bullet, verbatim, or null. */
    highlight: string | null
    currentRole: string | null
    /** The résumé variant suggested for this post (to attach). */
    variantName: string | null
  }
  regionFacts: ApplicationFacts | null
}

export interface ReplyDraft {
  channel: ReplyChannel
  subject: string | null
  body: string
  to: string | null
  origin: 'template' | 'ai'
  rejected?: string[]
}

export const REPLY_LIMITS = { linkedin: 700, email: 1_200 } as const

/** Claims a reply must not make unless the facts do. */
const RISKY = /\b(?:\d+\s*\+?\s*(?:years?|yrs?)|referred by|salary|ctc|lpa|visa|notice period|immediate(?:ly)? available|available immediately)\b/i

function first(name: string | null): string | null {
  const f = (name ?? '').trim().split(/\s+/)[0]
  return f && /^\p{L}/u.test(f) ? f : null
}

function roleRef(f: ReplyFacts): string {
  const role = f.post.role ? `the ${f.post.role} role` : 'the role'
  const at = f.post.company ? ` at ${f.post.company}` : ''
  const where = f.post.location ? ` in ${f.post.location}` : ''
  return `${role}${at}${where}`
}

function regionLine(f: ReplyFacts): string | null {
  const lines = f.regionFacts?.lines ?? []
  return lines.length > 0 ? lines.map((l) => `${l.label}: ${l.value}.`).join(' ') : null
}

/** The deterministic reply: only the facts, in a fixed shape. */
export function templateReply(f: ReplyFacts): ReplyDraft {
  const name = first(f.post.posterName)
  const greeting = name ? `Hi ${name},` : f.channel === 'email' ? 'Dear hiring team,' : 'Hello,'
  const skills = f.candidate.skills.slice(0, 4).join(', ')
  const me = [
    `I am ${f.candidate.name}, ${f.candidate.headline}${f.candidate.currentRole ? ` (${f.candidate.currentRole})` : ''}.`,
    skills ? `My skills include ${skills}.` : null,
    f.candidate.highlight ? `For example: ${f.candidate.highlight.replace(/[.\s]+$/, '')}.` : null,
  ]
    .filter(Boolean)
    .join(' ')
  const ask =
    f.channel === 'email'
      ? 'I have attached my CV and would be glad to talk.'
      : 'May I send you my CV? I can share it here or by email.'
  const parts = [greeting, '', `I saw your post about ${roleRef(f)} and would like to be considered.`, '', me, regionLine(f), '', ask, '', `Thank you,\n${f.candidate.name}`]
  const body = parts
    .filter((p): p is string => p !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, REPLY_LIMITS[f.channel])
  return {
    channel: f.channel,
    subject: f.channel === 'email' ? `Application: ${f.post.role ?? 'your opening'}${f.post.company ? ` at ${f.post.company}` : ''}` : null,
    body,
    to: f.channel === 'email' ? f.post.email : null,
    origin: 'template',
  }
}

/** Everything a reply may draw on. */
export function replyCorpus(f: ReplyFacts): string {
  return [
    f.post.posterName ?? '',
    f.post.role ?? '',
    f.post.company ?? '',
    f.post.location ?? '',
    f.post.snippet,
    f.post.email ?? '',
    f.candidate.name,
    f.candidate.headline,
    f.candidate.skills.join(' '),
    f.candidate.highlight ?? '',
    f.candidate.currentRole ?? '',
    f.candidate.variantName ?? '',
    (f.regionFacts?.lines ?? []).map((l) => `${l.label} ${l.value}`).join(' '),
  ].join('\n')
}

/** What in `body` is not backed by the facts (empty = passes). */
export function replyFactLock(body: string, f: ReplyFacts): string[] {
  return factLockAgainst(body, replyCorpus(f), { maxLength: REPLY_LIMITS[f.channel], risky: RISKY })
}

/** Keep an AI rewrite only when it passes the fact lock; else the template, with the reasons. */
export function lockedReply(f: ReplyFacts, ai: { subject?: string | null; body: string } | null): ReplyDraft {
  const base = templateReply(f)
  if (!ai || !ai.body.trim()) return base
  const issues = replyFactLock(`${ai.subject ?? ''}\n${ai.body}`, f)
  if (issues.length > 0) return { ...base, rejected: issues }
  return { ...base, subject: f.channel === 'email' ? ai.subject?.trim() || base.subject : null, body: ai.body.trim(), origin: 'ai' }
}
