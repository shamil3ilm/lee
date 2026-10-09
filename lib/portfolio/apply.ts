import type { ResumeProfile } from '@/lib/resume/types'
import { diffDocuments, type SectionDiff } from './diff'
import { contentHash, toJsonResume, type JsonDoc } from './map'
import { keepLeeOnlyItemsPrivate } from './overlay'
import { applyRepoSections } from './reverse'

/** Pure helpers of the portfolio → lee sync (no I/O). */

const NO_META = { version: '', lastModified: '' }

/**
 * The profile after taking every section that differs from the portfolio's
 * profile.json, plus the diff that drove it (repo = portfolio, lee = before).
 * On the first pull, items lee has that the portfolio never had stay as
 * private items. No diff → the same profile object back.
 */
export function applyPortfolio(
  profile: ResumeProfile,
  repo: JsonDoc,
  opts: { firstPull: boolean },
): { profile: ResumeProfile; diff: SectionDiff[] } {
  const base = opts.firstPull ? keepLeeOnlyItemsPrivate(profile, repo) : profile
  const diff = diffDocuments(repo, toJsonResume(base, NO_META))
  if (diff.length === 0) return { profile: base, diff }
  return { profile: applyRepoSections(base, repo, diff.map((d) => d.section)), diff }
}

/** The public projection (what profile.json would hold) as a stable hash. */
export function publicFactsHash(profile: ResumeProfile): string {
  return contentHash(toJsonResume(profile, NO_META))
}

/** True when `next` changes anything the portfolio holds (a public field, item, order or the portfolio page). */
export function publicFactsChanged(before: ResumeProfile | null, next: ResumeProfile): boolean {
  if (!before) return true
  return publicFactsHash(before) !== publicFactsHash(next)
}
