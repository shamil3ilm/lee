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
import { fixtureProfileAndJob, loadDiscoveryMatchFixtures, runDiscoveryMatchFixture } from './discovery-match'

export type ExpectStages = Partial<Record<Exclude<StageKey, 'odds'>, StageStatus | readonly StageStatus[]>>

export const STAGE_LABELS: ReadonlyArray<{ file: string; expectStages: ExpectStages; why: string }> = [
  { file: '03-us-only-remote.json', expectStages: { eligibility: 'fail' }, why: 'remote, US work authorisation only' },
  // Spec §3.2: "required, not mandatory" is at risk. The reused language detector reads
  // "fluent Arabic is required" as mandatory (the 34 ceiling): a known disagreement to settle in P1.
  { file: '07-arabic-required-soft.json', expectStages: { eligibility: 'at_risk' }, why: 'Arabic required, not worded mandatory' },
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

export function screeningStageReport(): StageReport {
  const fixtures = new Map(loadDiscoveryMatchFixtures().map((f) => [f.file, f] as const))
  const rows: StageReportRow[] = []
  for (const label of STAGE_LABELS) {
    const f = fixtures.get(label.file)
    if (!f) continue
    const { profile, job } = fixtureProfileAndJob(f)
    const detail = runDiscoveryMatchFixture(f).match
    const path = screeningPath({
      job,
      profile: matchProfileFrom(profile, NOW),
      resume: readResumeProfile(profile.resume),
      noticePeriods: searchPrefsFromProfile(profile).extra.noticePeriods,
      detail,
      variant: null,
      postedAt: null,
      firstSeenAt: null,
      now: NOW,
    })
    for (const [stage, want] of Object.entries(label.expectStages) as Array<[StageKey, StageStatus | readonly StageStatus[]]>) {
      const got = path.stages.find((s) => s.stage === stage)!.status
      const wants = typeof want === 'string' ? [want] : want
      rows.push({ file: label.file, stage, want: wants.join('|'), got, agree: wants.includes(got) })
    }
  }
  const fails = rows.filter((r) => r.want === 'fail')
  return {
    rows,
    agree: rows.filter((r) => r.agree).length,
    total: rows.length,
    knockoutRecall: { hit: fails.filter((r) => r.got === 'fail').length, of: fails.length },
  }
}

export function printScreeningStageReport(log: (line: string) => void = console.log): void {
  const r = screeningStageReport()
  log(`## screening-path stage labels (${STAGE_LABELS.length} cases, report only — not a gate)`)
  for (const row of r.rows) log(`  [${row.agree ? 'OK ' : 'DIFF'}] ${row.file} ${row.stage}: want ${row.want}, got ${row.got}`)
  log(`  stage agreement ${r.agree}/${r.total} · knockout recall ${r.knockoutRecall.hit}/${r.knockoutRecall.of}`)
  log('')
}
