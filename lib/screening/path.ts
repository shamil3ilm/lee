import { parseJd } from '@/lib/discovery/match/jd'
import { atsStage } from './ats'
import { eligibilityStage } from './eligibility'
import type { ScreenContext, ScreenInput } from './input'
import { managerStage } from './manager'
import { oddsStage } from './odds'
import { recruiterStage } from './recruiter'
import { byConcern } from './stage'
import { SCREEN_VERSION, type ScreenAction, type ScreeningPath, type StageResult } from './types'

/**
 * The screening path for one posting: pure and deterministic, computed on
 * read (no storage, no migration, no change to any Fit number). It READS
 * the match and relevance outputs; it never edits them.
 */

const MAX_NEXT = 5
const MAX_KEYWORDS = 3

function keywordAction(stages: readonly StageResult[]): ScreenAction | null {
  const ats = stages.find((s) => s.stage === 'ats')
  const terms = (ats?.checks ?? []).filter((c) => c.action?.kind === 'add_keyword').map((c) => c.key.replace(/^keyword:/, ''))
  if (terms.length === 0) return null
  const labels = (ats?.checks ?? [])
    .filter((c) => c.action?.kind === 'add_keyword')
    .slice(0, MAX_KEYWORDS)
    .map((c) => (c.short ?? '').replace(/^add /, ''))
  return { kind: 'add_keyword', label: `Add ${labels.join(' + ')} to the CV (you have ${terms.length === 1 ? 'it' : 'them'})` }
}

/** "Next": use the CV · add honest keywords · ask for a referral · prepare answers · then the rest. */
export function nextActions(stages: readonly StageResult[], variantName: string | null): ScreenAction[] {
  const out: ScreenAction[] = []
  if (variantName) out.push({ kind: 'use_variant', label: `Use “${variantName}”` })
  const kw = keywordAction(stages)
  if (kw) out.push(kw)
  const rest = stages.flatMap((s) => byConcern(s.checks).flatMap((c) => (c.action && c.action.kind !== 'add_keyword' ? [c.action] : [])))
  const rank: Record<ScreenAction['kind'], number> = {
    use_variant: 0,
    add_keyword: 1,
    referral: 2,
    prepare: 3,
    ask: 3,
    apply_direct: 4,
    quantify: 5,
    study: 6,
  }
  const seen = new Set(out.map((a) => a.label))
  for (const a of [...rest].sort((x, y) => rank[x.kind] - rank[y.kind])) {
    if (seen.has(a.label)) continue
    seen.add(a.label)
    out.push(a)
  }
  return out.slice(0, MAX_NEXT)
}

export function screeningPath(input: ScreenInput): ScreeningPath {
  const ctx: ScreenContext = { ...input, jd: parseJd(input.job) }
  const stages = [eligibilityStage(ctx), atsStage(ctx), recruiterStage(ctx), managerStage(ctx), oddsStage(ctx)]
  return { v: SCREEN_VERSION, stages, next: nextActions(stages, input.variant?.name ?? null) }
}
