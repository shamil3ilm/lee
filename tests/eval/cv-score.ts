/**
 * v12.0 — CV-score eval task. Shared by `tests/eval/run.ts` (snapshot +
 * expectation gate) and `tests/unit/cv-score-eval.test.ts` (so `pnpm test`
 * also enforces the expectations).
 *
 * Fixture shape (tests/eval/fixtures/cv-score/*.json):
 * {
 *   "name": "...",
 *   "inputs": {
 *     "cv": "strong" | "weak" | "stuffed" | { masterCV JSON },   // structured source
 *     "text": "...", "fileType": "pdf", "pageCount": 1,            // OR an upload
 *     "job": null | "backend" | { "@job": "backend", ...JobTarget overrides } | { full JobTarget },
 *     "profile": { "industries": [...] }
 *   },
 *   "expect": {
 *     "mode": "jd" | "general",
 *     "total": 81,                         // exact Total Match / CV Quality
 *     "totalLabel": "Total Match",
 *     "scores": { "impact": 100, "roleMatch": null, ... },   // exact headline scores (null = skipped)
 *     "grades": { "total": "B", ... },
 *     "skipped": ["requirementFit", ...],  // exact set of skipped keys
 *     "findings": ["substring", ...],       // each must appear in some finding message
 *     "noFindings": ["substring", ...]
 *   }
 * }
 */
import type { AIProvider } from '@/lib/ai/types'
import { computeCvScore } from '@/lib/cv-score/compute'
import { cvToScorable, type CvSourceInput } from '@/lib/cv-score/extract'
import { runRequirementFit } from '@/lib/cv-score/requirement-fit'
import type { CvScoreResult, JobTarget, ScorableCv } from '@/lib/cv-score/types'
import type { MasterCV } from '@/lib/documents/types'
import { backendJd, NOW, strongCv, stuffedCv, weakCv } from '@/tests/fixtures/cv-score/cvs'

export interface CvScoreFixtureInputs {
  cv?: 'strong' | 'weak' | 'stuffed' | MasterCV
  text?: string
  fileType?: string
  pageCount?: number
  job?: null | 'backend' | (Partial<JobTarget> & { '@job'?: 'backend' })
  profile?: { industries?: string[]; seniority?: string; yearsExperience?: number }
}

export interface CvScoreExpect {
  mode?: 'jd' | 'general'
  total?: number
  totalLabel?: string
  scores?: Record<string, number | null>
  grades?: Record<string, string | null>
  skipped?: string[]
  findings?: string[]
  noFindings?: string[]
}

function sourceOf(inputs: CvScoreFixtureInputs): CvSourceInput {
  if (inputs.text !== undefined) {
    return { kind: 'upload', text: inputs.text, fileType: inputs.fileType ?? 'pdf', pageCount: inputs.pageCount }
  }
  const cv =
    inputs.cv === 'strong' ? strongCv()
      : inputs.cv === 'weak' ? weakCv()
        : inputs.cv === 'stuffed' ? stuffedCv()
          : (inputs.cv as MasterCV)
  return { kind: 'master_cv', cv }
}

function targetOf(job: CvScoreFixtureInputs['job']): JobTarget | null {
  if (!job) return null
  if (job === 'backend') return backendJd()
  const { '@job': base, ...overrides } = job
  if (base === 'backend') return backendJd(overrides)
  return {
    title: '',
    techStack: [],
    requirements: [],
    niceToHave: [],
    responsibilities: [],
    descriptionMd: '',
    ...overrides,
  }
}

export async function runCvScoreFixture(inputs: CvScoreFixtureInputs, ai: AIProvider): Promise<CvScoreResult> {
  const cv: ScorableCv = cvToScorable(sourceOf(inputs))
  const target = targetOf(inputs.job)
  const fit = target
    ? await runRequirementFit({ cv, target, ai, includeAi: true })
    : null
  return computeCvScore({
    cv,
    target,
    ctx: { now: NOW, canAutofix: cv.meta.sourceKind === 'master_cv', profile: inputs.profile },
    requirementFit: fit?.outcome,
    source: { kind: cv.meta.sourceKind, label: 'eval' },
  })
}

/** Compact, stable summary used for snapshots. */
export function summarize(r: CvScoreResult): unknown {
  const kw = r.dimensions.keywords && !('skipped' in r.dimensions.keywords)
    ? (r.dimensions.keywords.details as { matched: string[]; partial: string[]; missing: string[] })
    : null
  return {
    scorerVersion: r.scorerVersion,
    mode: r.mode,
    total: { label: r.total.label, score: r.total.score, grade: r.total.grade },
    scores: Object.fromEntries(
      Object.values(r.scores).map((s) => [s.key, { score: s.score, grade: s.grade, weight: s.weight, ...(s.skipped ? { skipped: true } : {}) }]),
    ),
    skipped: r.skipped.map((s) => `${s.key}:${s.code}`),
    keywords: kw ? { matched: kw.matched, partial: kw.partial, missing: kw.missing } : null,
    findings: r.findings.map((f) => `${f.severity}|${f.dimension}|${f.message}`),
  }
}

/** Returns human-readable violations (empty = pass). */
export function checkExpectations(r: CvScoreResult, e: CvScoreExpect | undefined): string[] {
  if (!e) return []
  const out: string[] = []
  const eq = (what: string, got: unknown, want: unknown): void => {
    if (got !== want) out.push(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)
  }
  if (e.mode !== undefined) eq('mode', r.mode, e.mode)
  if (e.total !== undefined) eq('total', r.total.score, e.total)
  if (e.totalLabel !== undefined) eq('totalLabel', r.total.label, e.totalLabel)
  for (const [k, v] of Object.entries(e.scores ?? {})) {
    const got = k === 'total' ? r.total.score : r.scores[k as keyof typeof r.scores]?.score
    eq(`scores.${k}`, got, v)
  }
  for (const [k, v] of Object.entries(e.grades ?? {})) {
    const got = k === 'total' ? r.total.grade : r.scores[k as keyof typeof r.scores]?.grade
    eq(`grades.${k}`, got, v)
  }
  if (e.skipped) {
    const got = [...new Set(r.skipped.map((s) => s.key))].sort()
    const want = [...e.skipped].sort()
    eq('skipped', JSON.stringify(got), JSON.stringify(want))
  }
  for (const s of e.findings ?? []) {
    if (!r.findings.some((f) => f.message.includes(s))) out.push(`missing finding containing "${s}"`)
  }
  for (const s of e.noFindings ?? []) {
    if (r.findings.some((f) => f.message.includes(s))) out.push(`unexpected finding containing "${s}"`)
  }
  return out
}
