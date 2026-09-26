import { describe, expect, it } from 'vitest'
import {
  checkScamShieldExpectations,
  loadScamShieldFixtures,
  runScamShieldFixture,
  scamShieldMetrics,
  summarizeScamShield,
} from '@/tests/eval/scam-shield'

/**
 * v17 §1 — runs every labelled Scam Shield fixture and enforces its exact
 * `expect` block, so `pnpm test` gates rule regressions too (not only
 * `pnpm eval`).
 */
const fixtures = loadScamShieldFixtures()

describe('scam-shield eval fixtures', () => {
  it('has at least 12 scam and 12 legitimate postings', () => {
    expect(fixtures.filter((f) => f.label === 'scam').length).toBeGreaterThanOrEqual(12)
    expect(fixtures.filter((f) => f.label === 'legit').length).toBeGreaterThanOrEqual(12)
  })

  it('catches every scam and quarantines no legitimate posting', () => {
    const m = scamShieldMetrics(fixtures)
    expect(m.caught).toBe(m.scams)
    expect(m.falseQuarantines).toBe(0)
  })

  it.each(fixtures.map((f) => [f.file, f] as const))('%s meets its exact expectations', (_file, f) => {
    const a = runScamShieldFixture(f)
    expect(checkScamShieldExpectations(f, a)).toEqual([])
    expect(summarizeScamShield(runScamShieldFixture(f))).toEqual(summarizeScamShield(a))
  })
})
