/**
 * Screening-path stage labels (spec §6.3), REPORT ONLY: printed by
 * `pnpm eval` and checked for shape by a unit test, never a CI gate in
 * Phase 1. Each label says where a screener would stop for an existing
 * discovery-match fixture (tests/eval/fixtures/discovery-match), judged
 * from the posting and the base profile (PHP, Laravel, MySQL, REST APIs;
 * sponsorship needed in the GCC where the fixture says so). The labels are
 * the human call, not the code's output: disagreements are the report.
 */
import { matchProfileFrom } from '@/lib/discovery/match/profile'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { readResumeProfile } from '@/lib/resume/types'
import { screeningPath } from '@/lib/screening/path'
import type { StageKey, StageStatus } from '@/lib/screening/types'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { computeMatch } from '@/lib/discovery/match/score'
import type { MatchDetail } from '@/lib/discovery/match/types'
import { evaluateRelevance } from '@/lib/discovery/relevance/gate'
import type { ScreeningPath } from '@/lib/screening/types'
import { CALIBRATION_CASES } from './calibration-cases'
import { BACKEND_PAYMENTS } from './discovery-calibration'
import { fixtureProfileAndJob, loadDiscoveryMatchFixtures, runDiscoveryMatchFixture } from './discovery-match'

export type ExpectStages = Partial<Record<Exclude<StageKey, 'odds'>, StageStatus | readonly StageStatus[]>>

export const STAGE_LABELS: ReadonlyArray<{ file: string; expectStages: ExpectStages; why: string }> = [
  { file: '03-us-only-remote.json', expectStages: { eligibility: 'fail' }, why: 'remote, US work authorisation only' },
  // Spec §3.2: a required language you lack is a knockout; only "preferred / an advantage" is at risk.
  { file: '07-arabic-required-soft.json', expectStages: { eligibility: 'fail' }, why: 'fluent Arabic required' },
  { file: '08-visa-offered-and-pay.json', expectStages: { eligibility: 'pass' }, why: 'Jeddah, employment visa provided' },
  { file: '10-presence-note.json', expectStages: { eligibility: 'at_risk' }, why: 'must be based in the UAE, own visa only preferred' },
  { file: '11-gcc-riyadh-laravel-strong.json', expectStages: { eligibility: 'pass', ats: 'pass' }, why: 'visa provided; PHP, Laravel, MySQL, REST all on the CV' },
  { file: '12-doha-missing-kubernetes.json', expectStages: { ats: 'fail' }, why: 'Kubernetes and Docker must-haves, no evidence' },
  { file: '14-abu-dhabi-nationals-only.json', expectStages: { eligibility: 'fail' }, why: 'UAE nationals only' },
  { file: '15-dubai-nationals-preferred.json', expectStages: { eligibility: 'at_risk' }, why: 'UAE nationals preferred' },
  { file: '25-title-only-match-mismatching-jd.json', expectStages: { ats: 'fail' }, why: 'Kubernetes / Helm / Terraform must-haves' },
  { file: '26-odd-gcc-title-matching-jd.json', expectStages: { ats: 'pass' }, why: 'PHP, Laravel, MySQL, REST on the CV' },
  { file: '33-saudi-national-bank-not-nationals.json', expectStages: { eligibility: ['unknown', 'pass'] }, why: 'SNB is a bank, not a nationals ask; visa not mentioned' },
  { file: '35-emirati-candidates-only.json', expectStages: { eligibility: 'fail' }, why: 'Emirati candidates only' },
  { file: '36-for-kuwaiti-nationals.json', expectStages: { eligibility: 'fail' }, why: 'for Kuwaiti nationals' },
  { file: '37-visa-in-benefit-list.json', expectStages: { eligibility: 'pass' }, why: 'employment visa in the benefits list' },
  { file: '38-iqama-provided.json', expectStages: { eligibility: 'pass' }, why: 'iqama provided, transferable iqama not required' },
  { file: '39-visa-not-provided.json', expectStages: { eligibility: 'fail' }, why: 'visa not provided and sponsorship needed in the UAE' },
  { file: '42-arabic-mandatory-capped.json', expectStages: { eligibility: 'fail' }, why: 'must be fluent in Arabic' },
  { file: '43-arabic-mandatory-hard-rule.json', expectStages: { eligibility: 'fail' }, why: 'native Arabic speaker' },
  { file: '46-years-only-two-of-five.json', expectStages: { ats: 'pass' }, why: 'this profile lists Python and Django (the stretch is the 5+ years)' },
  { file: '48-kuwait-expats-welcome.json', expectStages: { eligibility: 'pass' }, why: 'all nationalities, work visa provided' },
]

export interface StageReportRow {
  file: string
  stage: string
  want: string
  got: StageStatus
  agree: boolean
}

export interface StageReport {
  rows: StageReportRow[]
  agree: number
  total: number
  /** Labelled fails the path also calls fail (spec target: 100% in P1). */
  knockoutRecall: { hit: number; of: number }
}

const NOW = new Date('2026-10-12T00:00:00Z')

function pathFor(profile: UserProfile, job: NormalizedJob, detail: MatchDetail, needsLook = false): ScreeningPath {
  return screeningPath({
    job,
    profile: matchProfileFrom(profile, NOW),
    resume: readResumeProfile(profile.resume),
    noticePeriods: searchPrefsFromProfile(profile).extra.noticePeriods,
    detail,
    variant: null,
    postedAt: null,
    firstSeenAt: null,
    needsLook,
    now: NOW,
  })
}

function rowsOf(file: string, path: ScreeningPath, expectStages: ExpectStages): StageReportRow[] {
  return (Object.entries(expectStages) as Array<[StageKey, StageStatus | readonly StageStatus[]]>).map(([stage, want]) => {
    const got = path.stages.find((s) => s.stage === stage)!.status
    const wants: readonly StageStatus[] = typeof want === 'string' ? [want] : want
    return { file, stage, want: wants.join('|'), got, agree: wants.includes(got) }
  })
}

function summarise(rows: StageReportRow[]): StageReport {
  const fails = rows.filter((r) => r.want === 'fail')
  return {
    rows,
    agree: rows.filter((r) => r.agree).length,
    total: rows.length,
    knockoutRecall: { hit: fails.filter((r) => r.got === 'fail').length, of: fails.length },
  }
}

/** The discovery-match fixture labels above. */
export function screeningStageReport(): StageReport {
  const fixtures = new Map(loadDiscoveryMatchFixtures().map((f) => [f.file, f] as const))
  const rows: StageReportRow[] = []
  for (const label of STAGE_LABELS) {
    const f = fixtures.get(label.file)
    if (!f) continue
    const { profile, job } = fixtureProfileAndJob(f)
    rows.push(...rowsOf(label.file, pathFor(profile, job, runDiscoveryMatchFixture(f).match), label.expectStages))
  }
  return summarise(rows)
}

/** The calibration set's optional `expectStages` (tests/eval/calibration-cases.ts), for the user-shaped profile. */
export function calibrationStageReport(): StageReport {
  const profile = BACKEND_PAYMENTS
  const rows: StageReportRow[] = []
  for (const c of CALIBRATION_CASES) {
    if (!c.expectStages) continue
    const job = { kind: 'job' as const, companyName: 'Example Co', employmentType: 'fulltime', applyUrl: 'https://jobs.example.com/x', techStack: [], raw: {}, ...c.job } as NormalizedJob
    const gate = evaluateRelevance(job, searchPrefsFromProfile(profile))
    const detail = computeMatch(job, matchProfileFrom(profile, NOW))
    rows.push(...rowsOf(c.id, pathFor(profile, job, detail, gate.needsLook === true), c.expectStages))
  }
  return summarise(rows)
}

function printReport(title: string, r: StageReport, log: (line: string) => void, verbose: boolean): void {
  log(`## ${title} (report only — not a gate)`)
  for (const row of r.rows) if (verbose || !row.agree) log(`  [${row.agree ? 'OK ' : 'DIFF'}] ${row.file} ${row.stage}: want ${row.want}, got ${row.got}`)
  log(`  stage agreement ${r.agree}/${r.total} · knockout recall ${r.knockoutRecall.hit}/${r.knockoutRecall.of}`)
  log('')
}

export function printScreeningStageReport(log: (line: string) => void = console.log): void {
  printReport(`screening-path stage labels, discovery-match fixtures (${STAGE_LABELS.length} cases)`, screeningStageReport(), log, true)
  const labelled = CALIBRATION_CASES.filter((c) => c.expectStages).length
  printReport(`screening-path stage labels, calibration set (${labelled} cases)`, calibrationStageReport(), log, false)
}
