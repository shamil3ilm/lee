import { contentStems } from '@/lib/cv-score/text'
import type { ParsedJd } from '@/lib/discovery/match/jd'
import { skillLabel, skillsInText } from '@/lib/discovery/match/lexicon'
import { checkDomainWording, checkFactLock } from '@/lib/resume/fact-lock'
import { presentation } from '@/lib/resume/readiness'
import type { Highlight } from '@/lib/resume/types'

/**
 * How well a wording speaks the JD's language, and which wordings of a
 * highlight may be shown at all. A wording is usable only when it passes
 * the number lock against its master highlight, and — for a design-only
 * highlight — the domain lock (no "built", "implemented", …). Pure.
 */

export interface JdTerms {
  skills: ReadonlySet<string>
  stems: ReadonlySet<string>
}

export function jdTerms(jd: ParsedJd): JdTerms {
  const stems = new Set<string>()
  for (const l of [...jd.must, ...jd.nice, ...jd.responsibilities]) for (const s of contentStems(l.text)) stems.add(s)
  return { skills: new Set(jd.stack), stems }
}

/** JD skills named ×2 plus content words shared. */
export function termScore(text: string, terms: JdTerms): number {
  let score = 0
  for (const s of skillsInText(text)) if (terms.skills.has(s)) score += 2
  for (const s of contentStems(text)) if (terms.stems.has(s)) score += 1
  return score
}

/** The JD words a text adds over another ("Kafka", "reconciliation"). */
export function addedTerms(text: string, over: string, terms: JdTerms): string[] {
  const had = skillsInText(over)
  const skills = [...skillsInText(text)].filter((s) => terms.skills.has(s) && !had.has(s)).map(skillLabel)
  const hadStems = contentStems(over)
  const words = text
    .split(/[^\p{L}\p{N}+#.-]+/u)
    .filter((w) => w.length > 3)
    .filter((w) => {
      const st = [...contentStems(w)][0]
      return st !== undefined && terms.stems.has(st) && !hadStems.has(st)
    })
  return [...new Set([...skills, ...words.map((w) => w.toLowerCase())])].slice(0, 4)
}

export type LockFailure = { ok: false; reason: string }

/** May `text` stand for highlight `h`? Number lock, and the domain lock for design-only items. */
export function lockWording(h: Highlight, text: string): { ok: true } | LockFailure {
  const numbers = checkFactLock(text, h.text)
  if (!numbers.ok) return { ok: false, reason: `Numbers not in the original: ${numbers.missing.join(', ')}` }
  if (presentation(h) === 'domain') {
    const domain = checkDomainWording(text)
    if (!domain.ok) return { ok: false, reason: `Design-only item claims implementation: ${domain.claims.join(', ')}` }
  }
  return { ok: true }
}

/** Approved alternates of `h` that may be shown (each passes the locks). */
export function usableAlternates(h: Highlight): Highlight['alternates'] {
  return h.alternates.filter((a) => lockWording(h, a.text).ok)
}
