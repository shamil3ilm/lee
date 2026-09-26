import type { RiskLevel, ScamSignal, SignalGroup } from './types'

/**
 * v17 §1 — serializable Scam Shield view for client components. Pure (no
 * server imports) so badges and drawers can import it directly.
 */

export type RiskTarget = 'discovery' | 'job'
export type RiskVerdict = 'not_scam' | 'confirmed_scam'

export interface RiskSignalView {
  id: string
  group: SignalGroup
  weight: number
  label: string
  evidence: string[]
}

export interface RiskView {
  targetType: RiskTarget
  targetId: string
  score: number
  level: RiskLevel
  signals: RiskSignalView[]
  rulesVersion: string
  verdict: RiskVerdict | null
  allowListed: boolean
  quarantined: boolean
  /** Where the posting came from (board/source name), for the report panel. */
  board: string | null
}

export interface RiskRowLike {
  targetType: string
  targetId: string
  score: number
  level: string
  signals: unknown
  rulesVersion: string
  userVerdict: string | null
  allowListed: boolean
}

const LEVELS: readonly RiskLevel[] = ['safe', 'caution', 'likely_scam']

function asLevel(v: string): RiskLevel {
  return (LEVELS as readonly string[]).includes(v) ? (v as RiskLevel) : 'caution'
}

function asVerdict(v: string | null): RiskVerdict | null {
  return v === 'not_scam' || v === 'confirmed_scam' ? v : null
}

/** Mirrors the SQL predicate in lib/db/queries/riskAssessments.ts. */
export function isQuarantined(row: Pick<RiskRowLike, 'level' | 'userVerdict' | 'allowListed'>): boolean {
  if (row.userVerdict === 'confirmed_scam') return true
  return row.level === 'likely_scam' && row.userVerdict === null && !row.allowListed
}

function toSignals(raw: unknown): RiskSignalView[] {
  if (!Array.isArray(raw)) return []
  return (raw as Partial<ScamSignal>[])
    .filter((s): s is ScamSignal => typeof s?.id === 'string' && Array.isArray(s.evidence))
    .map((s) => ({
      id: s.id,
      group: s.group,
      weight: s.weight,
      label: s.label,
      evidence: [...new Set(s.evidence.map((e) => e.text))],
    }))
}

export function toRiskView(row: RiskRowLike, board: string | null = null): RiskView {
  return {
    targetType: row.targetType === 'job' ? 'job' : 'discovery',
    targetId: row.targetId,
    score: row.score,
    level: asLevel(row.level),
    signals: toSignals(row.signals),
    rulesVersion: row.rulesVersion,
    verdict: asVerdict(row.userVerdict),
    allowListed: row.allowListed,
    quarantined: isQuarantined(row),
    board,
  }
}

export const LEVEL_LABEL: Record<RiskLevel, string> = {
  safe: 'Safe',
  caution: 'Caution',
  likely_scam: 'Likely scam',
}

export const GROUP_LABEL: Record<SignalGroup, string> = {
  money: 'Money',
  identity: 'Identity',
  channel: 'Channel',
  sender: 'Sender / domain',
  content: 'Content',
}
