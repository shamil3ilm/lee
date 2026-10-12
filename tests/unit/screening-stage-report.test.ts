import { describe, expect, it } from 'vitest'
import { CALIBRATION_CASES } from '@/tests/eval/calibration-cases'
import { calibrationStageReport, screeningStageReport, STAGE_LABELS } from '@/tests/eval/screening-stages'

/**
 * The screening-path stage labels are REPORT ONLY in Phase 1: this checks
 * the report runs over real fixtures and has its labels, not the agreement
 * (that is printed by `pnpm eval` and gated from P1 on).
 */
describe('screening stage report (not a gate)', () => {
  it('labels 20 existing fixtures and reports every label', () => {
    expect(new Set(STAGE_LABELS.map((l) => l.file)).size).toBe(20)
    const r = screeningStageReport()
    expect(r.total).toBe(STAGE_LABELS.reduce((n, l) => n + Object.keys(l.expectStages).length, 0))
    expect(r.rows.every((row) => ['pass', 'at_risk', 'fail', 'unknown'].includes(row.got))).toBe(true)
    expect(r.knockoutRecall.of).toBeGreaterThan(0)
  })

  it('reads the calibration set’s optional expectStages', () => {
    const labelled = CALIBRATION_CASES.filter((c) => c.expectStages)
    expect(labelled.length).toBeGreaterThanOrEqual(100)
    // Labels never touch the band expectations the gate reads.
    expect(CALIBRATION_CASES.every((c) => c.expect.length > 0)).toBe(true)
    const r = calibrationStageReport()
    expect(r.total).toBe(labelled.reduce((n, c) => n + Object.keys(c.expectStages!).length, 0))
    expect(r.knockoutRecall.of).toBeGreaterThan(0)
  })
})
