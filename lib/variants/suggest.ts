import { evaluateRelevance, type GateInput, type RegionTag } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS } from '@/lib/discovery/relevance/prefs'
import { roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { REGION_LABELS, type Region } from './types'

/**
 * Which variant fits a job: the posting's region (the relevance gate's
 * region tags) and role families (title classification), scored against
 * each variant's region and role family. Pure.
 */

export interface VariantSummary {
  id: string
  name: string
  region: Region
  roleFamily: string | null
  currentVersion: number
}

export interface JobSignals {
  regions: Region[]
  families: string[]
}

export interface VariantSuggestion {
  variant: VariantSummary | null
  reason: string
  /** When nothing fits well: the region + family a new variant should have. */
  create: { region: Region; roleFamily: string | null } | null
}

const TAG_TO_REGION: Readonly<Record<RegionTag, Region>> = { ae: 'gcc', gcc: 'gcc', in: 'india', remote: 'remote' }

export function jobSignals(job: GateInput): JobSignals {
  const gate = evaluateRelevance(job, EMPTY_PREFS)
  const regions = [...new Set(gate.regions.map((t) => TAG_TO_REGION[t]))]
  return { regions, families: gate.families }
}

/** Signals from stored region tags (discoveries.regions) and title families. */
export function signalsFromTags(tags: readonly string[], families: readonly string[]): JobSignals {
  const regions = [
    ...new Set(tags.flatMap((t) => (t in TAG_TO_REGION ? [TAG_TO_REGION[t as RegionTag]] : []))),
  ]
  return { regions, families: [...families] }
}

export function suggestVariant(variants: readonly VariantSummary[], signals: JobSignals): VariantSuggestion {
  const region: Region | null = signals.regions.find((r) => r !== 'remote') ?? signals.regions[0] ?? null
  const family = signals.families[0] ?? null
  const scored = variants
    .map((v) => {
      const regionHit = region !== null && v.region === region
      const familyHit = v.roleFamily !== null && signals.families.includes(v.roleFamily)
      return { v, regionHit, familyHit, score: (regionHit ? 2 : 0) + (familyHit ? 3 : 0) }
    })
    .sort((a, b) => b.score - a.score)
  const best = scored[0]
  const create =
    !best || !(best.regionHit && (best.familyHit || family === null)) ? { region: region ?? 'remote', roleFamily: family } : null
  if (!best || best.score === 0) {
    return { variant: null, reason: 'No variant matches this job yet.', create }
  }
  const why = [
    best.regionHit && region ? `${REGION_LABELS[region]} job` : null,
    best.familyHit && best.v.roleFamily ? roleFamilyLabel(best.v.roleFamily) : null,
  ].filter(Boolean)
  return { variant: best.v, reason: `Matches: ${why.join(' · ')}`, create }
}
