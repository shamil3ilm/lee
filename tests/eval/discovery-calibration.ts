/**
 * Match calibration: runs the labelled synthetic set
 * (tests/eval/calibration-cases.ts) through the relevance gate and the
 * deterministic Match Score for two synthetic profiles, and reports
 *   - band agreement: share of cases whose outcome is one of its labels;
 *   - the non-tech false-pass rate: non-tech postings that reach New with
 *     a Fit of 35 or more;
 *   - eligibility recall: eligibility traps that end weak or out of New.
 * `pnpm eval` prints it and fails past the thresholds; so does `pnpm test`
 * (tests/unit/discovery-calibration.test.ts).
 */
import type { UserProfile } from '@/lib/db/queries/profile'
import { evaluateRelevance } from '@/lib/discovery/relevance/gate'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { cappedFit, scoreBand } from '@/lib/discovery/match/blend'
import { matchProfileFrom } from '@/lib/discovery/match/profile'
import { computeMatch } from '@/lib/discovery/match/score'
import { CALIBRATION_CASES, NON_TECH_SLICES, type Band, type CalibrationCase, type Slice } from './calibration-cases'

export const CALIBRATION_THRESHOLDS = { maxNonTechFalsePass: 0.05, minBandAgreement: 0.8, minEligibilityRecall: 1 } as const

const NOW = new Date('2026-10-12T00:00:00Z')

const COMMON = {
  headline: 'Backend developer',
  summaryMd: null,
  industries: ['fintech'],
  roleTypes: ['backend', 'fullstack', 'api_integration', 'payments', 'einvoicing', 'erp'],
  seniority: null,
  seniorityLevels: ['junior', 'mid'],
  yearsExperience: 2,
  remotePref: 'any',
  remoteScope: 'worldwide',
  locationPrefs: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IN'].map((country) => ({ country, cities: [], priority: 1 })),
  acceptRelocation: false,
  willingToRelocateTo: [],
  stackWeights: {},
  mustHaves: [],
  dealbreakers: [],
  keywords: [],
  benefitPrefs: {},
  searchPrefsSavedAt: new Date('2026-10-01T00:00:00Z'),
}

/** The user's shape: Laravel, payments, ZATCA, plus Excel/SQL/Power BI; UAE and Kuwait starred. */
export const BACKEND_PAYMENTS = {
  ...COMMON,
  skills: ['PHP', 'Laravel', 'MySQL', 'PostgreSQL', 'REST APIs', 'SQL', 'Excel', 'Power BI', 'Git', 'Webhooks', 'Payment gateways', 'ZATCA e-invoicing', 'Vue.js'],
  discoveryPrefs: {
    basedIn: 'IN',
    sponsorshipFor: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
    preferredRegions: [
      { id: 'ae', level: 'top' },
      { id: 'kw', level: 'top' },
    ],
  },
} as unknown as UserProfile

/** No data skills, no stars. */
export const BACKEND_ONLY = {
  ...COMMON,
  skills: ['PHP', 'Laravel', 'MySQL', 'REST APIs', 'Git'],
  discoveryPrefs: { basedIn: 'IN', sponsorshipFor: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'] },
} as unknown as UserProfile

export const CALIBRATION_PROFILES: Readonly<Record<string, UserProfile>> = { 'backend-payments': BACKEND_PAYMENTS, 'backend-only': BACKEND_ONLY }

export interface CalibrationOutcome {
  id: string
  profile: string
  slice: Slice
  title: string
  inNew: boolean
  fit: number
  band: Band
  expect: readonly Band[]
  agrees: boolean
  /** Why it is out of New, or the ceiling reason. */
  note: string
}

export function runCalibrationCase(c: CalibrationCase, profileName: string, profile: UserProfile): CalibrationOutcome {
  const job = { kind: 'job' as const, companyName: 'Example Co', employmentType: 'fulltime', applyUrl: 'https://jobs.example.com/x', techStack: [], raw: {}, ...c.job }
  const gate = evaluateRelevance(job, searchPrefsFromProfile(profile))
  const needsLook = (gate as { needsLook?: boolean }).needsLook === true
  const detail = computeMatch(job, matchProfileFrom(profile, NOW))
  const fit = cappedFit(detail.score, null, detail) ?? 0
  const inNew = gate.pass && !needsLook
  const band: Band = inNew ? scoreBand(fit) : 'out'
  const note = !gate.pass ? gate.reasons.join(' · ') : needsLook ? 'needs a look' : (detail.ceiling?.reason ?? '')
  return { id: c.id, profile: profileName, slice: c.slice, title: c.job.title, inNew, fit, band, expect: c.expect, agrees: c.expect.includes(band), note }
}

export interface CalibrationReport {
  outcomes: CalibrationOutcome[]
  bandAgreement: number
  nonTechFalsePass: number
  eligibilityRecall: number
  bySlice: Record<string, { n: number; agree: number }>
}

export function runCalibration(cases: readonly CalibrationCase[] = CALIBRATION_CASES): CalibrationReport {
  const outcomes = Object.entries(CALIBRATION_PROFILES).flatMap(([name, p]) => cases.map((c) => runCalibrationCase(c, name, p)))
  const share = (xs: CalibrationOutcome[], ok: (o: CalibrationOutcome) => boolean): number => (xs.length === 0 ? 1 : xs.filter(ok).length / xs.length)
  const nonTech = outcomes.filter((o) => NON_TECH_SLICES.has(o.slice))
  const elig = outcomes.filter((o) => o.slice === 'eligibility')
  const bySlice: Record<string, { n: number; agree: number }> = {}
  for (const o of outcomes) {
    const s = (bySlice[o.slice] ??= { n: 0, agree: 0 })
    s.n += 1
    if (o.agrees) s.agree += 1
  }
  return {
    outcomes,
    bandAgreement: share(outcomes, (o) => o.agrees),
    nonTechFalsePass: nonTech.length === 0 ? 0 : nonTech.filter((o) => o.inNew && o.fit >= 35).length / nonTech.length,
    eligibilityRecall: share(elig, (o) => o.band === 'weak' || o.band === 'out'),
    bySlice,
  }
}

/** Threshold violations (empty = pass). */
export function calibrationFailures(r: CalibrationReport): string[] {
  const out: string[] = []
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
  if (r.nonTechFalsePass > CALIBRATION_THRESHOLDS.maxNonTechFalsePass) out.push(`non-tech false-pass ${pct(r.nonTechFalsePass)} > ${pct(CALIBRATION_THRESHOLDS.maxNonTechFalsePass)}`)
  if (r.bandAgreement < CALIBRATION_THRESHOLDS.minBandAgreement) out.push(`band agreement ${pct(r.bandAgreement)} < ${pct(CALIBRATION_THRESHOLDS.minBandAgreement)}`)
  if (r.eligibilityRecall < CALIBRATION_THRESHOLDS.minEligibilityRecall) out.push(`eligibility recall ${pct(r.eligibilityRecall)} < 100%`)
  return out
}

export function formatCalibration(r: CalibrationReport, verbose = false): string {
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
  const lines = [
    `cases ${r.outcomes.length} · band agreement ${pct(r.bandAgreement)} · non-tech false-pass ${pct(r.nonTechFalsePass)} · eligibility recall ${pct(r.eligibilityRecall)}`,
    ...Object.entries(r.bySlice).map(([s, v]) => `  ${s.padEnd(22)} ${v.agree}/${v.n}`),
  ]
  const shown = verbose ? r.outcomes : r.outcomes.filter((o) => !o.agrees)
  for (const o of shown) {
    lines.push(`  ${o.agrees ? 'ok  ' : 'MISS'} ${o.profile.padEnd(16)} ${o.id.padEnd(26)} ${o.title.slice(0, 40).padEnd(40)} ${o.inNew ? `Fit ${o.fit}` : 'out'} → ${o.band} (want ${o.expect.join('/')}) ${o.note}`)
  }
  return lines.join('\n')
}
