/**
 * v17 §1 — Scam Shield eval task. Shared by `tests/eval/run.ts` (exact
 * expectation gate + snapshot) and `tests/unit/scam-shield-eval.test.ts`
 * (so `pnpm test` enforces the same expectations).
 *
 * Fixture shape (tests/eval/fixtures/scam-shield/*.json):
 * {
 *   "name": "...",
 *   "label": "scam" | "legit",
 *   "inputs": ScamInput,                 // title, company, description, applyUrl, ...
 *   "net": NetContext,                   // optional cached network facts (never fetched)
 *   "expect": {
 *     "level": "likely_scam",            // exact level
 *     "signals": ["money.upfront_fee"],  // each must fire
 *     "noSignals": ["..."]               // none of these may fire
 *   }
 * }
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { assessScam } from '@/lib/scam/engine'
import { spansAreVerbatim, toFields } from '@/lib/scam/text'
import type { NetContext, RiskLevel, ScamAssessment, ScamInput } from '@/lib/scam/types'

export interface ScamShieldExpect {
  level: RiskLevel
  signals?: string[]
  noSignals?: string[]
}

export interface ScamShieldFixture {
  file: string
  name: string
  label: 'scam' | 'legit'
  inputs: ScamInput
  net?: NetContext
  expect: ScamShieldExpect
}

export const SCAM_SHIELD_DIR = path.resolve(process.cwd(), 'tests/eval/fixtures/scam-shield')

export function loadScamShieldFixtures(dir = SCAM_SHIELD_DIR): ScamShieldFixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ file, ...(JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Omit<ScamShieldFixture, 'file'>) }))
}

export function runScamShieldFixture(f: Pick<ScamShieldFixture, 'inputs' | 'net'>): ScamAssessment {
  return assessScam(f.inputs, f.net ?? null)
}

/** Violations of the fixture's exact expectations (empty = pass). */
export function checkScamShieldExpectations(
  f: Pick<ScamShieldFixture, 'inputs' | 'expect'>,
  result: ScamAssessment,
): string[] {
  const out: string[] = []
  const fired = new Set(result.signals.map((s) => s.id))
  if (result.level !== f.expect.level) {
    out.push(`level: expected ${f.expect.level}, got ${result.level} (score ${result.score}; ${[...fired].join(', ') || 'no signals'})`)
  }
  for (const id of f.expect.signals ?? []) if (!fired.has(id)) out.push(`missing signal ${id}`)
  for (const id of f.expect.noSignals ?? []) if (fired.has(id)) out.push(`unexpected signal ${id}`)
  const fields = toFields(f.inputs)
  for (const s of result.signals) {
    if (s.evidence.length === 0) out.push(`${s.id}: no evidence`)
    if (!spansAreVerbatim(fields, s.evidence)) out.push(`${s.id}: evidence is not verbatim`)
  }
  return out
}

/** Compact, stable snapshot of one result. */
export function summarizeScamShield(result: ScamAssessment): unknown {
  return {
    level: result.level,
    score: result.score,
    rulesVersion: result.rulesVersion,
    signals: result.signals.map((s) => ({ id: s.id, weight: s.weight, evidence: s.evidence.map((e) => e.text) })),
  }
}

export interface ScamShieldMetrics {
  total: number
  scams: number
  legit: number
  /** Scams rated likely_scam. */
  caught: number
  /** Legit postings rated likely_scam (would be quarantined). */
  falseQuarantines: number
  /** Legit postings rated caution. */
  legitCautions: number
}

export function scamShieldMetrics(fixtures: readonly ScamShieldFixture[]): ScamShieldMetrics {
  const m: ScamShieldMetrics = { total: 0, scams: 0, legit: 0, caught: 0, falseQuarantines: 0, legitCautions: 0 }
  for (const f of fixtures) {
    const level = runScamShieldFixture(f).level
    m.total += 1
    if (f.label === 'scam') {
      m.scams += 1
      if (level === 'likely_scam') m.caught += 1
    } else {
      m.legit += 1
      if (level === 'likely_scam') m.falseQuarantines += 1
      if (level === 'caution') m.legitCautions += 1
    }
  }
  return m
}
