/**
 * Discovery relevance + match-scoring eval task. Shared by
 * `tests/eval/run.ts` (exact expectation gate) and
 * `tests/unit/discovery-match-eval.test.ts` (so `pnpm test` enforces it).
 *
 * Fixture shape (tests/eval/fixtures/discovery-match/*.json), generic data only:
 * {
 *   "name": "...",
 *   "inputs": {
 *     "profile": Partial<UserProfile>,   // merged over a generic base profile
 *     "job": Partial<NormalizedJob>,     // merged over a generic base posting
 *     "aiScore": 80                      // raw AI score fed to applyCaps (optional)
 *   },
 *   "expect": {
 *     "pass": true,
 *     "reasons": ["seniority: Senior"],  // exact gate reasons (optional)
 *     "penalties": [...], "boosts": [...], "infos": [...],
 *     "regions": ["ae", "gcc"],
 *     "score": 85,                       // exact capped score (optional)
 *     "promptIncludes": ["\"target_seniority\""]
 *   }
 * }
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'
import { evaluateRelevance, type GateResult } from '@/lib/discovery/relevance/gate'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { applyCaps } from '@/lib/discovery/scoring'
import { buildScoreJobPrompt } from '@/lib/ai/prompts/score-job'

export interface DiscoveryMatchExpect {
  pass: boolean
  reasons?: string[]
  penalties?: string[]
  boosts?: string[]
  infos?: string[]
  regions?: string[]
  score?: number
  promptIncludes?: string[]
}

export interface DiscoveryMatchFixture {
  file: string
  name: string
  inputs: {
    profile?: Partial<UserProfile>
    job: Partial<NormalizedJob>
    aiScore?: number
  }
  expect: DiscoveryMatchExpect
}

export interface DiscoveryMatchResult {
  gate: GateResult
  score: number | null
  prompt: string
}

export const DISCOVERY_MATCH_DIR = path.resolve(process.cwd(), 'tests/eval/fixtures/discovery-match')

const BASE_PROFILE = {
  headline: 'Backend developer',
  summaryMd: null,
  skills: ['PHP', 'Laravel', 'MySQL', 'REST APIs'],
  industries: ['fintech'],
  roleTypes: ['backend', 'fullstack'],
  seniority: null,
  seniorityLevels: ['junior', 'mid'],
  yearsExperience: 1,
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
  discoveryPrefs: {},
  searchPrefsSavedAt: new Date('2026-09-27T00:00:00Z'),
} as unknown as UserProfile

const BASE_JOB: NormalizedJob = {
  kind: 'job',
  title: 'Backend Developer',
  companyName: 'Example Co',
  location: '',
  remoteType: 'onsite',
  employmentType: 'fulltime',
  descriptionMd: '',
  applyUrl: 'https://jobs.example.com/1',
  techStack: [],
  raw: {},
}

export function loadDiscoveryMatchFixtures(dir = DISCOVERY_MATCH_DIR): DiscoveryMatchFixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ file, ...(JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Omit<DiscoveryMatchFixture, 'file'>) }))
}

export function runDiscoveryMatchFixture(f: Pick<DiscoveryMatchFixture, 'inputs'>): DiscoveryMatchResult {
  const profile = { ...BASE_PROFILE, ...(f.inputs.profile ?? {}) } as UserProfile
  const job = { ...BASE_JOB, ...f.inputs.job } as NormalizedJob
  const gate = evaluateRelevance(job, searchPrefsFromProfile(profile))
  const score =
    typeof f.inputs.aiScore === 'number'
      ? applyCaps(
          {
            match_score: f.inputs.aiScore,
            strengths: [],
            red_flags: [],
            reasoning: '',
            location_match: 'priority_1',
            seniority_match: 'match',
            stack_overlap: [],
            stack_gaps: [],
            industry_match: 'weak',
          },
          job,
          profile,
        )
      : null
  return { gate, score, prompt: buildScoreJobPrompt(job, profile, { cvDigest: 'CV digest' }) }
}

function sameList(label: string, want: string[] | undefined, got: string[], out: string[]): void {
  if (want && JSON.stringify(want) !== JSON.stringify(got)) {
    out.push(`${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)
  }
}

export function checkDiscoveryMatch(f: Pick<DiscoveryMatchFixture, 'expect'>, r: DiscoveryMatchResult): string[] {
  const out: string[] = []
  const e = f.expect
  if (r.gate.pass !== e.pass) out.push(`pass: expected ${e.pass}, got ${r.gate.pass} (${r.gate.reasons.join(' · ')})`)
  sameList('reasons', e.reasons, r.gate.reasons, out)
  sameList('penalties', e.penalties, r.gate.penalties, out)
  sameList('boosts', e.boosts, r.gate.boosts, out)
  sameList('infos', e.infos, r.gate.infos, out)
  sameList('regions', e.regions, r.gate.regions, out)
  if (typeof e.score === 'number' && r.score !== e.score) out.push(`score: expected ${e.score}, got ${r.score}`)
  for (const s of e.promptIncludes ?? []) if (!r.prompt.includes(s)) out.push(`prompt lacks ${JSON.stringify(s)}`)
  return out
}
