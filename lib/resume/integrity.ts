import { checkFactLock, factLockMessage } from './fact-lock'
import type { Highlight, ResumeProfile } from './types'

function allHighlights(profile: ResumeProfile): Highlight[] {
  return [...profile.work.flatMap((w) => w.highlights), ...profile.projects.flatMap((p) => p.highlights)]
}

/**
 * The fact lock on save: every wording that is NEW in `next` (not stored
 * before) must keep the numbers of its highlight. Existing wordings that a
 * master edit made stale are not blocked — variants stop using them and
 * the editor flags them.
 */
export function newWordingErrors(previous: ResumeProfile | null, next: ResumeProfile): string[] {
  const known = new Set(previous ? allHighlights(previous).flatMap((h) => h.alternates.map((a) => `${a.id}\0${a.text}`)) : [])
  const errors: string[] = []
  for (const h of allHighlights(next)) {
    for (const a of h.alternates) {
      if (known.has(`${a.id}\0${a.text}`)) continue
      const lock = checkFactLock(a.text, h.text)
      if (!lock.ok) errors.push(`Wording "${a.text.slice(0, 60)}": ${factLockMessage(lock)}`)
    }
  }
  return errors
}

/**
 * Cross-field rules zod can't express: every id is unique across the whole
 * profile (variants and case studies reference them), and case studies
 * point at an existing work item and one of its highlights. Returns
 * user-facing problems; empty = OK.
 */
export function profileIntegrityErrors(profile: ResumeProfile): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const note = (id: string, what: string): void => {
    if (seen.has(id)) errors.push(`Duplicate id "${id}" (${what}).`)
    seen.add(id)
  }
  profile.basics.profiles.forEach((p) => note(p.id, 'link'))
  for (const w of profile.work) {
    note(w.id, 'work')
    for (const h of w.highlights) {
      note(h.id, 'highlight')
      h.alternates.forEach((a) => note(a.id, 'wording'))
    }
  }
  for (const p of profile.projects) {
    note(p.id, 'project')
    for (const h of p.highlights) {
      note(h.id, 'highlight')
      h.alternates.forEach((a) => note(a.id, 'wording'))
    }
  }
  for (const g of profile.skills) {
    note(g.id, 'skill group')
    g.skills.forEach((s) => note(s.id, 'skill'))
  }
  profile.education.forEach((e) => note(e.id, 'education'))
  profile.languages.forEach((l) => note(l.id, 'language'))
  profile.certificates.forEach((c) => note(c.id, 'certificate'))
  profile.portfolio.quickView.results.forEach((r) => note(r.id, 'quick view result'))

  for (const cs of profile.portfolio.caseStudies) {
    const job = profile.work.find((w) => w.id === cs.workId)
    if (!job) errors.push(`Case study "${cs.title}" points at a work item that no longer exists.`)
    else if (!job.highlights.some((h) => h.id === cs.highlightId)) {
      errors.push(`Case study "${cs.title}" points at a highlight that no longer exists.`)
    }
  }
  return errors
}
