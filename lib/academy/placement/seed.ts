import type { ResumeProfile } from '@/lib/resume/types'
import type { SkillGraph } from '@/lib/academy/content/graph'
import { levelForRating, levelName, type Level } from '@/lib/academy/levels'
import { evidenceUnits, type EvidenceUnit } from './evidence'
import { matchSkills } from './match'
import { studyTargetsFrom, type StudyTarget, type UnmappedStudyItem } from './study'

/**
 * Placement (v13 §3.2) seeded from the master profile. Only interview-ready
 * evidence (and, weakly, own domain-ready evidence) seeds a rating; every
 * seed says where it came from. Nothing about the profile is changed. Pure.
 */

export interface SeedSource {
  label: string
  /** e.g. "own", "AI-assisted, marked interview-ready", "own, domain only". */
  note: string
  strength: 'full' | 'domain'
}

export interface Seed {
  skillId: string
  rating: number
  deviation: number
  level: Level
  sources: SeedSource[]
  explanation: string
}

export interface Placement {
  seeds: Seed[]
  studyTargets: StudyTarget[]
  unmappedStudy: UnmappedStudyItem[]
}

// Full evidence lands inside Competent; more independent sources mean more
// confidence (lower deviation), not a higher level: Proficient and above
// must be earned in the Playground.
const FULL_SEEDS = [
  { rating: 1480, deviation: 200 },
  { rating: 1520, deviation: 180 },
  { rating: 1560, deviation: 160 },
] as const
const DOMAIN_SEED = { rating: 1300, deviation: 250 } as const
const MAX_EXPLAINED_SOURCES = 3

const DEPTH_NOTES = { own: 'own', ai_assisted: 'AI-assisted', learning: 'learning' } as const

function noteFor(u: EvidenceUnit): string {
  if (u.strength === 'domain') return 'own, domain only'
  return u.depth === 'own' ? 'own' : `${DEPTH_NOTES[u.depth]}, marked interview-ready`
}

function uniqueByLabel(sources: SeedSource[]): SeedSource[] {
  const seen = new Set<string>()
  return sources.filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)))
}

export function explainSeed(level: Level, sources: readonly SeedSource[]): string {
  const shown = sources.slice(0, MAX_EXPLAINED_SOURCES).map((s) => `${s.label} (${s.note})`)
  const more = sources.length - shown.length
  return `Seeded at ${levelName(level)} from: ${shown.join(', ')}${more > 0 ? ` +${more} more` : ''}`
}

function seedFor(skillId: string, full: SeedSource[], domain: SeedSource[]): Seed | null {
  const sources = full.length > 0 ? full : domain
  if (sources.length === 0) return null
  const base = full.length > 0 ? FULL_SEEDS[Math.min(full.length, FULL_SEEDS.length) - 1]! : DOMAIN_SEED
  const level = levelForRating(base.rating)
  return { skillId, rating: base.rating, deviation: base.deviation, level, sources, explanation: explainSeed(level, sources) }
}

export function placeFromProfile(profile: ResumeProfile, graph: SkillGraph): Placement {
  const units = evidenceUnits(profile)
  const full = new Map<string, SeedSource[]>()
  const domain = new Map<string, SeedSource[]>()
  const studyMatches: Array<{ unit: EvidenceUnit; skillIds: string[] }> = []
  for (const u of units) {
    const skillIds = matchSkills(graph, { terms: u.terms, text: u.text })
    if (u.strength === 'study') {
      studyMatches.push({ unit: u, skillIds })
      continue
    }
    const target = u.strength === 'full' ? full : domain
    const source: SeedSource = { label: u.label, note: noteFor(u), strength: u.strength }
    for (const id of skillIds) target.set(id, [...(target.get(id) ?? []), source])
  }
  const seeds = graph.skills.flatMap((s) => {
    const seed = seedFor(s.id, uniqueByLabel(full.get(s.id) ?? []), uniqueByLabel(domain.get(s.id) ?? []))
    return seed ? [seed] : []
  })
  const { targets, unmapped } = studyTargetsFrom(studyMatches)
  return { seeds, studyTargets: targets, unmappedStudy: unmapped }
}
