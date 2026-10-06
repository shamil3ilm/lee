import { checkFactLock, factLockMessage } from './fact-lock'
import { newId, type IdFactory } from './ids'
import type { Highlight, Wording } from './types'

export const MAX_WORDINGS = 8

export type AddWordingResult =
  | { ok: true; highlight: Highlight; wording: Wording }
  | { ok: false; error: string }

/**
 * Add an alternate wording to a master highlight, fact-locked: refused when
 * it carries a number the highlight does not. Returns a new highlight.
 */
export function addWording(
  highlight: Highlight,
  text: string,
  source: Wording['source'],
  makeId: IdFactory = () => newId('w'),
): AddWordingResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'The wording is empty.' }
  if (trimmed === highlight.text.trim()) return { ok: false, error: 'That is the original wording.' }
  if (highlight.alternates.some((a) => a.text.trim() === trimmed)) {
    return { ok: false, error: 'That wording is already saved.' }
  }
  if (highlight.alternates.length >= MAX_WORDINGS) {
    return { ok: false, error: `At most ${MAX_WORDINGS} wordings per highlight.` }
  }
  const lock = checkFactLock(trimmed, highlight.text)
  if (!lock.ok) return { ok: false, error: factLockMessage(lock) }
  const wording: Wording = { id: makeId(), text: trimmed, source }
  return { ok: true, highlight: { ...highlight, alternates: [...highlight.alternates, wording] }, wording }
}

export function removeWording(highlight: Highlight, wordingId: string): Highlight {
  return { ...highlight, alternates: highlight.alternates.filter((a) => a.id !== wordingId) }
}

export interface EffectiveWording {
  text: string
  /** The wording actually used; null = the master text. */
  wordingId: string | null
  /** A wording was chosen but is gone or no longer passes the lock. */
  stale: boolean
}

/**
 * The text a variant shows for a highlight. A chosen wording is re-checked
 * against the CURRENT master text every time, so editing a fact in the
 * master can never leave an outdated number in a résumé.
 */
export function effectiveWording(highlight: Highlight, wordingId: string | null): EffectiveWording {
  if (!wordingId) return { text: highlight.text, wordingId: null, stale: false }
  const chosen = highlight.alternates.find((a) => a.id === wordingId)
  if (!chosen || !checkFactLock(chosen.text, highlight.text).ok) {
    return { text: highlight.text, wordingId: null, stale: true }
  }
  return { text: chosen.text, wordingId: chosen.id, stale: false }
}

/** Every stored wording that no longer passes the lock (e.g. after a master edit). */
export function staleWordings(highlight: Highlight): Wording[] {
  return highlight.alternates.filter((a) => !checkFactLock(a.text, highlight.text).ok)
}
