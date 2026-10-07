import type { CodeLanguage } from '@/lib/academy/problems/schema'

/**
 * Code drafts autosaved per problem and language in localStorage, plus the
 * last language used. Every access is wrapped in try/catch: storage can be
 * missing, full or blocked (private windows), and the workbench must work
 * without it. Client-only.
 */

const PREFIX = 'lee:problems:v1'
export const DRAFT_MAX_CHARS = 64_000

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function draftKey(slug: string, language: CodeLanguage): string {
  return `${PREFIX}:draft:${slug}:${language}`
}

export function loadDraft(slug: string, language: CodeLanguage): string | null {
  try {
    return storage()?.getItem(draftKey(slug, language)) ?? null
  } catch {
    return null
  }
}

export function saveDraft(slug: string, language: CodeLanguage, code: string): boolean {
  try {
    const s = storage()
    if (!s) return false
    s.setItem(draftKey(slug, language), code.slice(0, DRAFT_MAX_CHARS))
    return true
  } catch {
    return false
  }
}

export function clearDraft(slug: string, language: CodeLanguage): void {
  try {
    storage()?.removeItem(draftKey(slug, language))
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

export function loadLanguage(): CodeLanguage | null {
  try {
    return (storage()?.getItem(`${PREFIX}:language`) as CodeLanguage | null) ?? null
  } catch {
    return null
  }
}

export function saveLanguage(language: CodeLanguage): void {
  try {
    storage()?.setItem(`${PREFIX}:language`, language)
  } catch {
    /* storage unavailable */
  }
}

/** When the workbench was first opened for this problem today (for the time axis). */
export function openedAt(slug: string, now: number = Date.now()): number {
  const key = `${PREFIX}:opened:${slug}`
  try {
    const s = storage()
    const prev = Number(s?.getItem(key) ?? '')
    if (Number.isFinite(prev) && prev > 0 && now - prev < 6 * 3600 * 1000) return prev
    s?.setItem(key, String(now))
  } catch {
    /* storage unavailable: count from now */
  }
  return now
}

export function resetOpenedAt(slug: string): void {
  try {
    storage()?.removeItem(`${PREFIX}:opened:${slug}`)
  } catch {
    /* storage unavailable */
  }
}
