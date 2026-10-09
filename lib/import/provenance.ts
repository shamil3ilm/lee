import type { ImportSource, ResumeProfile } from '@/lib/resume/types'
import type { UpdatedItem } from './resume-merge'

/**
 * Client-safe, pure. Master-profile items an import batch added carry its
 * `source` and `importedAt`; these find, count and remove exactly those.
 */

export interface BatchRef {
  source: ImportSource | string
  importedAt: string
}

const fromBatch =
  (b: BatchRef) =>
  (x: { source?: string; importedAt?: string }): boolean =>
    x.source === b.source && x.importedAt === b.importedAt

export function batchItemCounts(profile: ResumeProfile, b: BatchRef): Record<string, number> {
  const is = fromBatch(b)
  const counts: Record<string, number> = {
    work: profile.work.filter(is).length,
    projects: profile.projects.filter(is).length,
    skills: profile.skills.flatMap((g) => g.skills).filter(is).length,
    education: profile.education.filter(is).length,
    certificates: profile.certificates.filter(is).length,
    languages: profile.languages.filter(is).length,
  }
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
}

/** Labels of the items a batch added, for "what will be removed". */
export function batchItemLabels(profile: ResumeProfile, b: BatchRef): string[] {
  const is = fromBatch(b)
  return [
    ...profile.work.filter(is).map((w) => `${w.position} · ${w.name}`),
    ...profile.projects.filter(is).map((p) => p.name),
    ...profile.skills.flatMap((g) => g.skills).filter(is).map((s) => s.name),
    ...profile.education.filter(is).map((e) => e.institution),
    ...profile.certificates.filter(is).map((c) => c.name),
    ...profile.languages.filter(is).map((l) => l.language),
  ]
}

/** Remove the batch's items; skill groups left empty by it go too. */
export function removeBatchItems(profile: ResumeProfile, b: BatchRef): ResumeProfile {
  const keep = <T extends { source?: string; importedAt?: string }>(xs: readonly T[]): T[] => xs.filter((x) => !fromBatch(b)(x))
  const skills = profile.skills
    .map((g) => ({ g, next: { ...g, skills: keep(g.skills) } }))
    .filter(({ g, next }) => next.skills.length > 0 || g.skills.length === 0)
    .map(({ next }) => next)
  return {
    ...profile,
    work: keep(profile.work),
    projects: keep(profile.projects),
    skills,
    education: keep(profile.education),
    certificates: keep(profile.certificates),
    languages: keep(profile.languages),
  }
}

/** Put back items an update replaced (only items still in the profile). */
export function restoreUpdatedItems(profile: ResumeProfile, updated: readonly UpdatedItem[]): { profile: ResumeProfile; restored: number } {
  let restored = 0
  const swap = <T extends { id: string }>(section: UpdatedItem['section'], list: readonly T[]): T[] =>
    list.map((x) => {
      const u = updated.find((v) => v.section === section && v.id === x.id)
      if (!u) return x
      restored += 1
      return u.before as T
    })
  const next: ResumeProfile = {
    ...profile,
    work: swap('work', profile.work),
    projects: swap('projects', profile.projects),
    education: swap('education', profile.education),
    certificates: swap('certificates', profile.certificates),
    languages: swap('languages', profile.languages),
  }
  return { profile: next, restored }
}
