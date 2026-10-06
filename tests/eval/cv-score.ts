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
 *     "noFindings": ["substring", ...],
 *     // v1.1 calibration — ranges instead of exact values, plus what was parsed:
 *     "totalRange": [80, 95],
 *     "scoreRanges": { "impact": [60, 90] },
 *     "parse": { "bulletsPerRole": [6, 3], "companies": ["Acme"], "years": 1.3, "bullets": 14 }
 *   }
 * }
 *
 * v1.1 inputs: "text": "@tricky" uses the synthetic tricky-layout CV
 * (tests/fixtures/cv-score/tricky.ts); "links" are the file's hyperlinks;
 * "region" is the target market; "now" overrides the reference date.
 */
import type { AIProvider } from '@/lib/ai/types'
import { computeCvScore } from '@/lib/cv-score/compute'
import { cvToScorable, type CvSourceInput } from '@/lib/cv-score/extract'
import { runRequirementFit } from '@/lib/cv-score/requirement-fit'
import type { StructureDetails } from '@/lib/cv-score/dimensions/structure'
import type { ImpactDetails } from '@/lib/cv-score/dimensions/impact'
import { isSkipped, type CvScoreResult, type JobTarget, type RegionHint, type ScorableCv } from '@/lib/cv-score/types'
import type { MasterCV } from '@/lib/documents/types'
import { backendJd, NOW, strongCv, stuffedCv, weakCv } from '@/tests/fixtures/cv-score/cvs'
import { TRICKY_LINKS, TRICKY_TEXT } from '@/tests/fixtures/cv-score/tricky'

export interface CvScoreFixtureInputs {
  cv?: 'strong' | 'weak' | 'stuffed' | MasterCV
  text?: string
  fileType?: string
  pageCount?: number
  /** v1.1 — hyperlink targets in the file; "@tricky" = the tricky fixture's links. */
  links?: string[] | '@tricky'
  /** v1.1 — target market from search preferences. */
  region?: RegionHint | null
  /** v1.1 — reference date (ISO); defaults to the fixtures' NOW. */
  now?: string
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
  /** v1.1 — calibration bands (inclusive). */
  totalRange?: [number, number]
  scoreRanges?: Record<string, [number, number]>
  parse?: {
    bulletsPerRole?: number[]
    companies?: string[]
    titles?: string[]
    years?: number
    bullets?: number
  }
}

function sourceOf(inputs: CvScoreFixtureInputs): CvSourceInput {
  if (inputs.text !== undefined) {
    const links = inputs.links === '@tricky' ? TRICKY_LINKS : inputs.links
    return {
      kind: 'upload',
      text: inputs.text === '@tricky' ? TRICKY_TEXT : inputs.text,
      fileType: inputs.fileType ?? 'pdf',
      pageCount: inputs.pageCount,
      ...(links ? { links } : {}),
    }
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
    ctx: {
      now: inputs.now ? new Date(inputs.now) : NOW,
      canAutofix: cv.meta.sourceKind === 'master_cv',
      profile: inputs.profile,
      region: inputs.region ?? null,
    },
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
    evidence: r.findings.map((f) => (f.evidence ?? []).map((e) => e.index)),
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
  const inRange = (what: string, got: number | null | undefined, [lo, hi]: [number, number]): void => {
    if (got === null || got === undefined || got < lo || got > hi) out.push(`${what}: expected ${lo}–${hi}, got ${JSON.stringify(got)}`)
  }
  if (e.totalRange) inRange('total', r.total.score, e.totalRange)
  for (const [k, band] of Object.entries(e.scoreRanges ?? {})) {
    inRange(`scores.${k}`, r.scores[k as keyof typeof r.scores]?.score, band)
  }
  if (e.parse) out.push(...checkParse(r, e.parse))
  return out
}

function checkParse(r: CvScoreResult, p: NonNullable<CvScoreExpect['parse']>): string[] {
  const out: string[] = []
  const st = r.dimensions.structure && !isSkipped(r.dimensions.structure)
    ? (r.dimensions.structure.details as StructureDetails)
    : null
  const im = r.dimensions.impact && !isSkipped(r.dimensions.impact) ? (r.dimensions.impact.details as ImpactDetails) : null
  const eq = (what: string, got: unknown, want: unknown): void => {
    if (JSON.stringify(got) !== JSON.stringify(want)) out.push(`parse.${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)
  }
  if (p.bulletsPerRole) eq('bulletsPerRole', st?.bulletsPerRole, p.bulletsPerRole)
  if (p.companies) eq('companies', st?.roles?.map((x) => x.company), p.companies)
  if (p.titles) eq('titles', st?.roles?.map((x) => x.title), p.titles)
  if (p.years !== undefined) eq('years', st?.years, p.years)
  if (p.bullets !== undefined) eq('bullets', im?.bullets, p.bullets)
  return out
}
