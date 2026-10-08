import { ageDays, tractionScore, velocity } from './novelty'
import { REASON_LABELS, type Relevance, type RelevanceChip } from './relevance'
import type { NewMetrics, NewSource } from './types'

/**
 * The "what's new" score, per user. Pure.
 *
 *   score = 100 × (0.35·traction + 0.15·corroboration + 0.20·authority
 *                  + 0.20·relevance + 0.10·freshness)
 *
 *   traction       0..1, log-scaled early velocity: Hub likes or GitHub
 *                  stars per day since creation, HN points, paper upvotes
 *                  (lib/radar/new/novelty.ts); 0.5 for releases and official
 *                  posts, which have no traction metric
 *   corroboration  (sources − 1) / 2, capped at 1: the same thing on 2+ sources
 *   authority      the best source: official lab post 1.0, release 0.9,
 *                  HF Daily Papers 0.7, Hub model 0.6, GitHub 0.5, HN 0.4,
 *                  Hub Space or dataset 0.3
 *   relevance      0..1 from the user's ready skills, study list, release
 *                  list and role families (lib/radar/new/relevance.ts)
 *   freshness      1 − age / 30 days (age from the thing's own creation date)
 *
 * Every factor that lifts an entry shows as a reason chip.
 */

export const WEIGHTS = { traction: 0.35, corroboration: 0.15, authority: 0.2, relevance: 0.2, freshness: 0.1 } as const

export const AUTHORITY: Readonly<Record<NewSource, number>> = {
  feeds: 1,
  releases: 0.9,
  hf_papers: 0.7,
  hf: 0.6,
  github: 0.5,
  hn: 0.4,
}

/** Hub Spaces and datasets rank below models. */
const MINOR_GROUPS: ReadonlySet<string> = new Set(['space', 'dataset'])

export interface RankInput {
  sources: readonly string[]
  group: string | null
  metrics: NewMetrics
  createdAt: Date | null
  firstSeenAt: Date
}

export type ChipKind = 'traction' | 'sources' | 'official' | 'fresh' | 'relevance'

export interface Chip {
  kind: ChipKind
  label: string
}

export interface Ranked {
  score: number
  relevance: number
  chips: Chip[]
}

function round(n: number): string {
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, '')
}

function tractionOf(m: NewMetrics, created: Date | null, now: Date, sources: readonly string[]): { t: number; chip: string | null } {
  const options: Array<{ t: number; chip: string }> = []
  if (m.likes) options.push({ t: tractionScore('hf', m.likes, created, now), chip: `${round(velocity(m.likes, created, now))} likes/day` })
  if (m.stars) options.push({ t: tractionScore('github', m.stars, created, now), chip: `${round(velocity(m.stars, created, now))} stars/day` })
  if (m.points) options.push({ t: tractionScore('hn', m.points, created, now), chip: `${m.points} HN points` })
  if (m.upvotes) options.push({ t: tractionScore('hf_papers', m.upvotes, created, now), chip: `${m.upvotes} upvotes` })
  const best = options.sort((a, b) => b.t - a.t)[0]
  if (best) return best
  return { t: sources.includes('feeds') || sources.includes('releases') ? 0.5 : 0, chip: null }
}

function authorityOf(sources: readonly string[], group: string | null): number {
  const values = sources.map((s) => {
    const a = AUTHORITY[s as NewSource] ?? 0.3
    return s === 'hf' && group && MINOR_GROUPS.has(group) ? 0.3 : a
  })
  return Math.max(0, ...values)
}

export function rankEntry(input: RankInput, relevance: Relevance, now: Date): Ranked {
  const created = input.createdAt ?? input.firstSeenAt
  const tr = tractionOf(input.metrics, input.createdAt, now, input.sources)
  const sourceCount = new Set(input.sources).size
  const corroboration = Math.min(1, Math.max(0, sourceCount - 1) / 2)
  const authority = authorityOf(input.sources, input.group)
  const age = ageDays(created, now)
  const freshness = Math.max(0, 1 - age / 30)
  const score =
    100 *
    (WEIGHTS.traction * tr.t +
      WEIGHTS.corroboration * corroboration +
      WEIGHTS.authority * authority +
      WEIGHTS.relevance * relevance.score +
      WEIGHTS.freshness * freshness)

  const chips: Chip[] = relevance.chips.map((c: RelevanceChip) => ({ kind: 'relevance', label: `${c.label} · ${REASON_LABELS[c.reason]}` }))
  if (tr.chip && tr.t >= 0.3) chips.push({ kind: 'traction', label: tr.chip })
  if (sourceCount >= 2) chips.push({ kind: 'sources', label: `On ${sourceCount} sources` })
  if (input.sources.includes('feeds')) chips.push({ kind: 'official', label: 'Official lab post' })
  else if (input.sources.includes('releases')) chips.push({ kind: 'official', label: 'Official release' })
  if (age < 1) chips.push({ kind: 'fresh', label: 'New today' })
  else if (age < 7) chips.push({ kind: 'fresh', label: 'New this week' })
  return { score: Math.round(score), relevance: relevance.score, chips }
}
