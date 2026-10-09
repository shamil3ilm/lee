import { assessScam } from '@/lib/scam/engine'
import { LEVEL_LABEL } from '@/lib/scam/view'
import { inputFromNormalizedJob } from '@/lib/scam/input'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { classifyHiringPost } from './classify'
import { buildHiringPost } from './post'
import { capBytes } from './snippet'
import { canonicalPostUrl, canonicalProfileUrl } from './urls'
import { LINKEDIN_POST_LABEL, type PostCandidate } from './types'

/**
 * "Add from text or link" for LinkedIn posts: the user copied a post's text
 * (and maybe its link) or only the link. Recognised when the text holds a
 * LinkedIn post link, or reads as a hiring post without being a list of
 * openings. A link alone is stored as a link: lee never opens it, and asks
 * for the post text instead. Pure apart from Scam Shield's rules (no I/O).
 */

export const MAX_POST_PASTE_CHARS = 4_000
const URL_RE = /https?:\/\/[^\s<>"'`{}|\\^[\]]+/gi
/** Lines LinkedIn's web page adds around a copied post. */
const CHROME_RE =
  /^(?:•\s*)?(?:1st|2nd|3rd\+?|following|follow|\+ follow|connect|promoted|edited|visible to anyone on or off linkedin|…\s*more|see more|see translation|like|comment|repost|send|\d[\d,]*\s*(?:reactions?|comments?|reposts?|likes?))$|^\d+\s*(?:s|m|h|d|w|mo|yr)\s*•?.*$/i

function urls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?)'"]+$/, ''))
}

/** "Layla Haddad" / "Talent Acquisition Lead at …" at the top of a copied post. */
function posterLines(lines: readonly string[]): { name: string; headline: string } {
  const useful = lines.map((l) => l.trim()).filter((l) => l && !CHROME_RE.test(l))
  const first = useful[0] ?? ''
  const looksLikeName = /^[\p{Lu}][\p{L}'.-]+(?: [\p{Lu}][\p{L}'.-]+){1,3}$/u.test(first) && first.length <= 60
  if (!looksLikeName) return { name: '', headline: '' }
  const second = useful[1] ?? ''
  const headline = second.length <= 120 && /\b(?:at|@)\b|\|/.test(second) ? second : ''
  return { name: first, headline }
}

function stripChrome(text: string, poster: { name: string; headline: string }): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const kept = lines.filter((l, i) => {
    if (CHROME_RE.test(l)) return false
    // The poster's name / headline at the top are not post text.
    if (i < 6 && (l === poster.name || (poster.headline && l === poster.headline))) return false
    return true
  })
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function riskOf(normalized: Partial<NormalizedJob>): PostCandidate['risk'] {
  const a = assessScam(inputFromNormalizedJob(normalized, LINKEDIN_POST_LABEL))
  if (a.level === 'safe') return null
  return { level: LEVEL_LABEL[a.level], labels: a.signals.slice(0, 3).map((s) => s.label) }
}

/** A pasted LinkedIn post (text and/or link), or null when the paste is something else. */
export function readPastedPost(raw: string, via: PostCandidate['via'] = 'paste'): PostCandidate | null {
  const text = raw.slice(0, MAX_POST_PASTE_CHARS)
  const all = urls(text)
  const postLink = all.map((u) => canonicalPostUrl(u)).find((l) => l !== null) ?? null
  const profile = all.map((u) => canonicalProfileUrl(u)).find((u) => u !== null) ?? null
  const otherLinks = all.filter((u) => !canonicalPostUrl(u) && !canonicalProfileUrl(u))
  const body = text.replace(URL_RE, ' ').trim()
  const verdict = classifyHiringPost(body)
  // A list of openings (an AI Mode answer) is not one post.
  if (!postLink && !(verdict.hiring && otherLinks.length <= 2)) return null
  const linkOnly = body.replace(/\s+/g, '').length < 20
  const poster = linkOnly ? { name: '', headline: '' } : posterLines(text.split(/\r?\n/))
  const postText = linkOnly ? '' : capBytes(stripChrome(text, poster).replace(URL_RE, (u) => (canonicalPostUrl(u) || canonicalProfileUrl(u) ? '' : u)).trim())
  const built = buildHiringPost({
    via,
    link: postLink,
    posterName: poster.name || null,
    posterHeadline: poster.headline || null,
    posterUrl: profile,
    text: postText,
  })
  return {
    via,
    text: postText,
    postUrl: postLink?.url ?? null,
    linkOnly,
    posterName: poster.name,
    posterHeadline: poster.headline,
    posterUrl: profile,
    role: built.facts.role ?? '',
    company: built.facts.company ?? '',
    location: built.facts.location,
    contact: built.meta.contact,
    hiring: built.verdict.hiring,
    reasons: built.verdict.reasons.slice(0, 5),
    negatives: built.verdict.negatives.slice(0, 3),
    risk: linkOnly ? null : riskOf((built.item?.normalized as NormalizedJob | undefined) ?? { title: built.facts.role ?? 'Hiring post', companyName: built.facts.company ?? '', post: built.meta }),
  }
}

