import { describe, expect, it } from 'vitest'
import { CALIBRATION_CASES } from '@/tests/eval/calibration-cases'
import { calibrationFailures, CALIBRATION_THRESHOLDS, runCalibration } from '@/tests/eval/discovery-calibration'

/**
 * The Match calibration gate (review 2026-10-10 §1.10): the labelled
 * synthetic set must keep the non-tech false-pass rate at or below 5 %,
 * band agreement at or above 80 % and every eligibility trap weak or out of
 * New. `pnpm eval` runs the same gate.
 */
describe('Match calibration', () => {
  const report = runCalibration()

  it('has about 150 labelled postings in every slice', () => {
    expect(CALIBRATION_CASES.length).toBeGreaterThanOrEqual(150)
    expect(CALIBRATION_CASES.filter((c) => c.slice === 'nontech').length).toBeGreaterThanOrEqual(30)
  })

  it('passes the thresholds', () => {
    expect(calibrationFailures(report)).toEqual([])
    expect(report.nonTechFalsePass).toBeLessThanOrEqual(CALIBRATION_THRESHOLDS.maxNonTechFalsePass)
    expect(report.bandAgreement).toBeGreaterThanOrEqual(CALIBRATION_THRESHOLDS.minBandAgreement)
  })

  it('never lets a non-tech posting into New at Fit 55 or more', () => {
    const leaks = report.outcomes.filter((o) => (o.slice === 'nontech' || o.slice === 'boilerplate') && o.inNew && o.fit >= 55)
    expect(leaks.map((o) => `${o.profile} ${o.title} ${o.fit}`)).toEqual([])
  })
})
