import { newId, type IdFactory } from './ids'
import type { Highlight, ResumeProfile, Wording } from './types'
import { addWording } from './wordings'

/**
 * Add a fact-locked wording to one highlight anywhere in the profile.
 * Returns the new profile and the wording id, or null when the highlight is
 * gone or the wording is refused (number lock, duplicate, too many).
 */
export function addWordingToProfile(
  profile: ResumeProfile,
  highlightId: string,
  text: string,
  source: Wording['source'],
  makeId: IdFactory = () => newId('w'),
): { profile: ResumeProfile; wordingId: string } | null {
  let wordingId: string | null = null
  const patch = (h: Highlight): Highlight => {
    if (h.id !== highlightId || wordingId) return h
    const r = addWording(h, text, source, makeId)
    if (!r.ok) return h
    wordingId = r.wording.id
    return r.highlight
  }
  const next: ResumeProfile = {
    ...profile,
    work: profile.work.map((w) => ({ ...w, highlights: w.highlights.map(patch) })),
    projects: profile.projects.map((p) => ({ ...p, highlights: p.highlights.map(patch) })),
  }
  return wordingId ? { profile: next, wordingId } : null
}
