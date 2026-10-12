import {
  GATE_STAGES,
  type ScreeningPath,
  type StageCheck,
  type StageKey,
  type StageResult,
  type StageStatus,
} from './types'

/**
 * Shared stage rules (client-safe):
 *   - a stage's status is the WORST of its checks (fail > at risk > unknown
 *     > pass); "unknown" never turns a pass into a fail;
 *   - two or more unknowns in the eligibility stage make it at risk: that is
 *     where the unasked knockout question lives;
 *   - a stage with no checks is unknown.
 */

const RANK: Readonly<Record<StageStatus, number>> = { pass: 0, unknown: 1, at_risk: 2, fail: 3 }

/** Default per-status credit when a stage has no finer score. */
export const STATUS_SCORE: Readonly<Record<StageStatus, number>> = { pass: 1, unknown: 0.9, at_risk: 0.7, fail: 0.2 }

export function worst(statuses: readonly StageStatus[]): StageStatus {
  return statuses.reduce<StageStatus>((a, b) => (RANK[b] > RANK[a] ? b : a), 'pass')
}

export function stageStatus(stage: StageKey, checks: readonly StageCheck[]): StageStatus {
  if (checks.length === 0) return 'unknown'
  const w = worst(checks.map((c) => c.status))
  if (stage === 'eligibility' && w === 'unknown' && checks.filter((c) => c.status === 'unknown').length >= 2) return 'at_risk'
  return w
}

/** Checks ordered worst first (stable within a status). */
export function byConcern(checks: readonly StageCheck[]): StageCheck[] {
  return checks
    .map((c, i) => ({ c, i }))
    .sort((a, b) => RANK[b.c.status] - RANK[a.c.status] || a.i - b.i)
    .map(({ c }) => c)
}

/** The first gate stage that isn't a pass (eligibility → manager), or null. */
export function firstConcern(path: Pick<ScreeningPath, 'stages'>): StageResult | null {
  for (const key of GATE_STAGES) {
    const s = path.stages.find((x) => x.stage === key)
    if (s && s.status !== 'pass') return s
  }
  return null
}

const CHIP_PREFIX: Readonly<Record<StageKey, string>> = {
  eligibility: '',
  ats: 'ATS',
  recruiter: 'Recruiter',
  manager: 'Manager',
  odds: 'Odds',
}

const ELIGIBILITY_PREFIX: Readonly<Record<StageStatus, string>> = {
  fail: 'Knockout',
  at_risk: 'At risk',
  unknown: 'Ask',
  pass: 'Pass',
}

/**
 * The card chip: the first gate stage that isn't a pass, in a few words.
 * "At risk: notice period", "Knockout: nationals only", "ATS: 3 must-haves
 * missing". Null when every gate stage passes (no chip).
 */
export function chipText(path: Pick<ScreeningPath, 'stages'>): { text: string; status: StageStatus; stage: StageKey } | null {
  const s = firstConcern(path)
  if (!s) return null
  const top = byConcern(s.checks)[0]
  const what = (s.short ?? top?.short ?? top?.key ?? s.summary).trim()
  const text = s.stage === 'eligibility' ? `${ELIGIBILITY_PREFIX[s.status]}: ${what}` : `${CHIP_PREFIX[s.stage]}: ${what}`
  return { text, status: s.status, stage: s.stage }
}

const LIST_CHECKS_PER_STAGE = 4
/** ATS concerns are short keywords; the chip's hover lists them all. */
const LIST_ATS_CHECKS = 12

/**
 * What a list row ships to the client: each stage with its concerns only
 * (pass checks dropped, at most four per stage; twelve ATS keywords). The full path is computed
 * again when a detail page opens.
 */
export function compactPath(path: ScreeningPath): ScreeningPath {
  return {
    ...path,
    stages: path.stages.map((s) => ({
      ...s,
      checks: byConcern(s.checks.filter((c) => c.status !== 'pass')).slice(0, s.stage === 'ats' ? LIST_ATS_CHECKS : LIST_CHECKS_PER_STAGE),
    })),
    next: path.next.slice(0, 4),
  }
}
