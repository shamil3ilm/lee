import type { RadarNotifyMode } from '../digest'
import { NEW_CATEGORIES, NEW_CATEGORY_LABELS, type NewCategory } from './types'

/**
 * The weekly "What's new" digest section: the top few per category by the
 * user's own ranking, among entries lee first saw in the window. It goes
 * in the Monday digest whatever the radar mode, except `off`. Pure.
 */

export const DIGEST_PER_CATEGORY = 3

export interface NewDigestCandidate {
  id: string
  name: string
  category: NewCategory
  url: string
  score: number
  /** Reason chip labels, most important first. */
  reasons: readonly string[]
  firstSeenAt: Date
}

export interface NewDigestLine {
  id: string
  name: string
  url: string
  reasons: string[]
}

export interface NewDigestSection {
  category: NewCategory
  label: string
  lines: NewDigestLine[]
}

export function whatsNewInDigest(mode: RadarNotifyMode): boolean {
  return mode !== 'off'
}

export function selectWhatsNewDigest(
  candidates: readonly NewDigestCandidate[],
  opts: { since: Date; perCategory?: number },
): NewDigestSection[] {
  const per = opts.perCategory ?? DIGEST_PER_CATEGORY
  const recent = candidates.filter((c) => c.firstSeenAt.getTime() >= opts.since.getTime())
  return NEW_CATEGORIES.flatMap((category): NewDigestSection[] => {
    const lines = recent
      .filter((c) => c.category === category)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, per)
      .map((c) => ({ id: c.id, name: c.name, url: c.url, reasons: c.reasons.slice(0, 2) }))
    return lines.length > 0 ? [{ category, label: NEW_CATEGORY_LABELS[category], lines }] : []
  })
}
