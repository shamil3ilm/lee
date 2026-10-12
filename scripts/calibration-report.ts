#!/usr/bin/env tsx
/**
 * Print the Match calibration report (tests/eval/discovery-calibration.ts):
 *   pnpm tsx scripts/calibration-report.ts        misses only
 *   pnpm tsx scripts/calibration-report.ts -v     every case
 * Exits 1 when a threshold fails (same gate as `pnpm eval`).
 */
import { calibrationFailures, formatCalibration, runCalibration } from '@/tests/eval/discovery-calibration'

const report = runCalibration()
console.log(formatCalibration(report, process.argv.includes('-v')))
const failures = calibrationFailures(report)
for (const f of failures) console.log(`FAIL ${f}`)
process.exit(failures.length > 0 ? 1 : 0)
