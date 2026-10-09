import { checkFactLock, type FactLockResult } from '@/lib/resume/fact-lock'
import type { ResumeProfile } from '@/lib/resume/types'

/**
 * Client-safe, pure. The fact lock for LinkedIn text (post drafts, the
 * headline / About suggestions, and the user's final post): every number
 * must appear in the master profile or the chosen source's facts, and every
 * link must be one lee knows (the profile's own links, the source's link).
 * Same rule as wordings (lib/resume/fact-lock.ts): it may change words,
 * never facts.
 */

export function profileFactText(profile: ResumeProfile): string {
  const b = profile.basics
  const parts: string[] = [b.name, b.label, b.summary, b.url, ...b.profiles.map((p) => p.url)]
  for (const w of profile.work) {
    parts.push(w.name, w.position, w.location, w.startDate, w.endDate, w.summary, ...w.keywords)
    for (const h of w.highlights) parts.push(h.text, ...h.alternates.map((a) => a.text))
  }
  for (const p of profile.projects) {
    parts.push(p.name, p.description, p.url, p.startDate, p.endDate, ...p.keywords)
    for (const h of p.highlights) parts.push(h.text, ...h.alternates.map((a) => a.text))
  }
  for (const g of profile.skills) parts.push(g.name, ...g.skills.map((s) => s.name))
  for (const e of profile.education) parts.push(e.institution, e.area, e.studyType, e.startDate, e.endDate, e.score)
  for (const c of profile.certificates) parts.push(c.name, c.issuer, c.date, c.url)
  for (const l of profile.languages) parts.push(l.language)
  for (const c of profile.portfolio.caseStudies) parts.push(c.title, c.url)
  return parts.filter(Boolean).join('\n')
}

const URL_RE = /https?:\/\/[^\s)]+/gi

export function linksIn(text: string): string[] {
  return [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, '')))]
}

export interface PostLockResult {
  ok: boolean
  numbers: FactLockResult['missing']
  links: string[]
}

/** Does `text` state only numbers and links found in `facts`? */
export function checkPostFacts(text: string, facts: string): PostLockResult {
  const numbers = checkFactLock(text.replace(URL_RE, ' '), facts).missing
  const known = new Set(linksIn(facts).map((u) => u.toLowerCase()))
  const links = linksIn(text).filter((u) => !known.has(u.toLowerCase()))
  return { ok: numbers.length === 0 && links.length === 0, numbers, links }
}

export function postLockMessage(r: PostLockResult): string {
  const parts: string[] = []
  if (r.numbers.length > 0) parts.push(`numbers not in your profile: ${r.numbers.join(', ')}`)
  if (r.links.length > 0) parts.push(`links lee does not know: ${r.links.join(', ')}`)
  return `Fact lock: ${parts.join('; ')}.`
}
