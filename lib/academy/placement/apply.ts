import type { EvidenceUnit } from './evidence'
import type { Seed } from './seed'

/**
 * How profile seeds meet stored ratings. Practice wins: a skill with any
 * attempt keeps its rating (the diagnostic and practice have already moved
 * it); only unpractised skills take the seed, and an unpractised seed whose
 * evidence disappeared (e.g. the user un-marked an item) is removed. Pure.
 */

export interface ExistingRating {
  skillId: string
  attempts: number
  seeded: boolean
}

export interface SeedWrites {
  upserts: Seed[]
  removals: string[]
}

export function seedWrites(existing: readonly ExistingRating[], seeds: readonly Seed[]): SeedWrites {
  const byId = new Map(existing.map((e) => [e.skillId, e]))
  const seeded = new Set(seeds.map((s) => s.skillId))
  return {
    upserts: seeds.filter((s) => (byId.get(s.skillId)?.attempts ?? 0) === 0),
    removals: existing.filter((e) => e.attempts === 0 && e.seeded && !seeded.has(e.skillId)).map((e) => e.skillId),
  }
}

/** FNV-1a 32-bit, hex: a cheap, stable fingerprint (not security). */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Fingerprint of the evidence placement reads (re-seed only when it changes). */
export function evidenceSignature(units: readonly EvidenceUnit[], graphVersion: string): string {
  const parts = units.map((u) => [u.id, u.strength, u.depth, u.terms.join(','), u.text, u.targetDate, u.notes.length])
  return fnv1a(JSON.stringify([graphVersion, parts]))
}
