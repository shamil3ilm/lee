import { describe, expect, it } from 'vitest'
import {
  bandWord,
  blend,
  composeHeadlines,
  gradeFor,
  TOTAL_WEIGHTS_GENERAL,
  TOTAL_WEIGHTS_JD,
} from '@/lib/cv-score/headlines'
import { computeCvScore } from '@/lib/cv-score/compute'
import { cvToScorable } from '@/lib/cv-score/extract'
import { headlineDeltas } from '@/lib/cv-score/compare'
import { sortFindings, makeFinding } from '@/lib/cv-score/findings'
import {
  evidenceInCv,
  requirementFitResult,
  runRequirementFit,
  verifyRequirementFit,
} from '@/lib/cv-score/requirement-fit'
import {
  addSkillRejection,
  applyChanges,
  rewriteRejection,
  termEvidenced,
} from '@/lib/cv-score/autofix'
import { checkCvScoreSignal } from '@/lib/ai/signal'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import type { DimensionOutcome, DimensionKey } from '@/lib/cv-score/types'
import { backendJd, NOW, strongCv, weakCv } from '@/tests/fixtures/cv-score/cvs'

const d = (score: number, details: object = {}): DimensionOutcome => ({ score, details, findings: [] })
const skip = (code: string): DimensionOutcome => ({ skipped: true, code, reason: `skipped: ${code}` })

describe('grades & weights', () => {
  it.each([
    [100, 'A'], [85, 'A'], [84, 'B'], [75, 'B'], [74, 'C'], [65, 'C'], [64, 'D'], [50, 'D'], [49, 'F'], [0, 'F'],
  ] as const)('gradeFor(%i) = %s', (score, grade) => {
    expect(gradeFor(score)).toBe(grade)
  })

  it('band words', () => {
    expect([90, 80, 70, 55, 10].map(bandWord)).toEqual(['Excellent', 'Strong', 'Good', 'Needs work', 'Weak'])
  })

  it('weight tables sum to 100', () => {
    const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0)
    expect(sum(TOTAL_WEIGHTS_JD)).toBe(100)
    expect(sum(TOTAL_WEIGHTS_GENERAL)).toBe(100)
  })

  it('blend renormalises over non-null components', () => {
    expect(blend([
      { key: 'a', label: 'A', score: 50, weight: 0.6 },
      { key: 'b', label: 'B', score: 100, weight: 0.4 },
    ]).score).toBe(70)
    const r = blend([
      { key: 'a', label: 'A', score: null, weight: 0.6, note: 'skipped' },
      { key: 'b', label: 'B', score: 80, weight: 0.4 },
    ])
    expect(r.score).toBe(80)
    expect(r.breakdown).toEqual([
      { key: 'a', label: 'A', score: null, weight: 0, note: 'skipped' },
      { key: 'b', label: 'B', score: 80, weight: 1 },
    ])
    expect(blend([{ key: 'a', label: 'A', score: null, weight: 1 }]).score).toBeNull()
  })
})

describe('composeHeadlines', () => {
  const general: Partial<Record<DimensionKey, DimensionOutcome>> = {
    ats: d(80, { checks: [], stuffing: { terms: [], skillsListed: 0, stuffed: false } }),
    impact: d(60),
    readability: d(70),
    structure: d(90),
  }

  it('no JD → CV Quality over ATS/Impact/Readability/Structure; JD scores show "pick a job"', () => {
    const r = composeHeadlines({ dimensions: general, jdMode: false })
    // (80·35 + 60·30 + 70·20 + 90·15) / 100 = 73.5 → 74
    expect(r.total).toMatchObject({ label: 'CV Quality', score: 74, grade: 'C' })
    expect(r.weights).toEqual([
      { key: 'ats', label: 'ATS Score', base: 35, effective: 0.35 },
      { key: 'impact', label: 'Impact Score', base: 30, effective: 0.3 },
      { key: 'readability', label: 'Readability Score', base: 20, effective: 0.2 },
      { key: 'structure', label: 'Structure Score', base: 15, effective: 0.15 },
    ])
    for (const k of ['roleMatch', 'skillsMatch', 'experienceMatch'] as const) {
      expect(r.scores[k]).toMatchObject({ score: null, grade: null, skipped: true, reason: 'Pick a job to see match', weight: 0 })
    }
    expect(r.skipped.map((s) => s.key)).toEqual(['roleMatch', 'skillsMatch', 'experienceMatch'])
  })

  const jd: Partial<Record<DimensionKey, DimensionOutcome>> = {
    ...general,
    ats: d(100, { checks: [], stuffing: { terms: [], skillsListed: 0, stuffed: false } }),
    requirementFit: d(50, { items: [], met: 0, partial: 0, missing: 0, downgraded: 0 }),
    roleAlignment: d(100, { responsibilitiesTotal: 2 }),
    keywords: d(80, { required: [], niceToHave: [], matched: [], partial: [], missing: [], presence: 0.5, coverage: {} }),
    seniority: d(90, { years: 6, requiredYears: 5, jdLevel: 'senior' }),
    domain: skip('no_jd_industry'),
  }

  it('JD mode → Total Match blends all seven headline scores', () => {
    const r = composeHeadlines({ dimensions: jd, jdMode: true, targetTitle: 'Backend Engineer' })
    expect(r.scores.roleMatch.score).toBe(70) // 50·0.6 + 100·0.4
    expect(r.scores.skillsMatch.score).toBe(80)
    expect(r.scores.experienceMatch.score).toBe(90) // domain skipped → seniority only
    expect(r.scores.ats.score).toBe(85) // 100·0.7 + 50·0.3
    // (70·25 + 80·20 + 90·15 + 85·20 + 60·10 + 70·5 + 90·5) / 100 = 78
    expect(r.total).toMatchObject({ label: 'Total Match', score: 78, grade: 'B', verdict: 'Strong match for Backend Engineer' })
    expect(r.weights.map((w) => [w.key, w.base, w.effective])).toEqual([
      ['roleMatch', 25, 0.25], ['skillsMatch', 20, 0.2], ['experienceMatch', 15, 0.15],
      ['ats', 20, 0.2], ['impact', 10, 0.1], ['readability', 5, 0.05], ['structure', 5, 0.05],
    ])
    expect(r.skipped).toEqual([{ key: 'domain', code: 'no_jd_industry', reason: 'skipped: no_jd_industry' }])
  })

  it('AI requirement fit skipped → Role Match falls back to alignment and says why', () => {
    const r = composeHeadlines({ dimensions: { ...jd, requirementFit: skip('cv_score_cv_too_short') }, jdMode: true })
    expect(r.scores.roleMatch.score).toBe(100)
    expect(r.scores.roleMatch.reason).toBe('Requirement fit skipped: skipped: cv_score_cv_too_short')
    expect(r.skipped.map((s) => s.key)).toContain('requirementFit')
  })

  it('a skipped headline score renormalises Total Match weights', () => {
    const r = composeHeadlines({ dimensions: { ...jd, keywords: skip('no_jd_skills') }, jdMode: true })
    expect(r.scores.skillsMatch).toMatchObject({ score: null, skipped: true, weight: 0 })
    expect(r.scores.ats.score).toBe(100) // no keyword presence → format only
    // (70·25 + 90·15 + 100·20 + 60·10 + 70·5 + 90·5) / 80 = 81.25 → 81
    expect(r.total.score).toBe(81)
    expect(r.weights.find((w) => w.key === 'roleMatch')!.effective).toBe(0.313)
    expect(r.weights.find((w) => w.key === 'skillsMatch')!.effective).toBe(0)
    expect(r.skipped.map((s) => s.key)).toEqual(['keywords', 'domain', 'skillsMatch'])
  })

  it('stuffing halves JD keyword presence inside ATS', () => {
    const stuffed = { ...jd, ats: d(100, { checks: [], stuffing: { terms: ['go'], skillsListed: 60, stuffed: true } }) }
    const r = composeHeadlines({ dimensions: stuffed, jdMode: true })
    expect(r.scores.ats.score).toBe(78) // 100·0.7 + 25·0.3 = 77.5 → 78
  })
})

describe('computeCvScore', () => {
  it('produces every headline score for a JD and sorts findings by severity', () => {
    const r = computeCvScore({
      cv: cvToScorable({ kind: 'master_cv', cv: weakCv() }),
      target: backendJd(),
      ctx: { now: NOW, canAutofix: true },
      source: { kind: 'master_cv', label: 'Weak' },
    })
    expect(r.mode).toBe('jd')
    expect(Object.keys(r.scores)).toEqual(['roleMatch', 'skillsMatch', 'experienceMatch', 'ats', 'impact', 'readability', 'structure'])
    const ranks = r.findings.map((f) => ({ critical: 0, major: 1, minor: 2 })[f.severity])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(r.findings.every((f) => f.headlines.length > 0)).toBe(true)
    expect(r.target).toEqual({ applicationId: 'app-1', title: 'Senior Backend Engineer', companyName: 'FinPay' })
  })

  it('is exactly reproducible', () => {
    const run = () => computeCvScore({
      cv: cvToScorable({ kind: 'master_cv', cv: strongCv() }),
      target: backendJd(),
      ctx: { now: NOW, canAutofix: true },
      source: { kind: 'master_cv', label: 'Strong' },
    })
    expect(run()).toEqual(run())
  })

  it('headline deltas (b − a)', () => {
    const mk = (cv: ReturnType<typeof strongCv>) => computeCvScore({
      cv: cvToScorable({ kind: 'master_cv', cv }), target: backendJd(), ctx: { now: NOW, canAutofix: false }, source: { kind: 'master_cv', label: 'x' },
    })
    const a = mk(weakCv())
    const b = mk(strongCv())
    const deltas = headlineDeltas(a, b)
    expect(deltas[0]).toMatchObject({ key: 'total', label: 'Total Match', a: a.total.score, b: b.total.score })
    expect(deltas[0]!.delta).toBe(b.total.score! - a.total.score!)
    expect(deltas).toHaveLength(8)
  })
})

describe('findings ordering', () => {
  it('orders by severity then Total-Match weight', () => {
    const minorImpact = makeFinding('impact', { severity: 'minor', message: 'a' })
    const minorSkills = makeFinding('keywords', { severity: 'minor', message: 'b' })
    const major = makeFinding('structure', { severity: 'major', message: 'c' })
    const w = (k: string): number => ({ skillsMatch: 0.2, impact: 0.1, structure: 0.05 } as Record<string, number>)[k] ?? 0
    expect(sortFindings([minorImpact, minorSkills, major], w).map((f) => f.message)).toEqual(['c', 'b', 'a'])
  })
})

describe('requirement fit verification', () => {
  const cvText = 'Led the PostgreSQL migration for 30M rows.\nMentored 4 engineers on the payments team.'

  it('evidence must exist (case/space-insensitive; ellipsis fragments)', () => {
    expect(evidenceInCv('led the postgresql   migration', cvText)).toBe(true)
    expect(evidenceInCv('"Mentored 4 engineers…payments team"', cvText)).toBe(true)
    expect(evidenceInCv('Led the MySQL migration', cvText)).toBe(false)
    expect(evidenceInCv('', cvText)).toBe(false)
  })

  it('downgrades unverifiable quotes one step and keeps verified ones', () => {
    const items = verifyRequirementFit(
      ['PostgreSQL', 'Kafka', 'Mentoring', 'Go', 'Rust'],
      [
        { requirement: 'PostgreSQL', status: 'met', evidence: 'Led the PostgreSQL migration for 30M rows.', suggestion: '' },
        { requirement: 'Kafka', status: 'met', evidence: 'Built Kafka pipelines', suggestion: 'x' },
        { requirement: 'Mentoring', status: 'partial', evidence: 'Coached juniors', suggestion: 'y' },
        { requirement: 'Go', status: 'missing', evidence: '', suggestion: 'z' },
      ],
      cvText,
    )
    expect(items.map((i) => [i.requirement, i.status, i.evidenceVerified, i.downgradedFrom])).toEqual([
      ['PostgreSQL', 'met', true, undefined],
      ['Kafka', 'partial', false, 'met'],
      ['Mentoring', 'missing', false, 'partial'],
      ['Go', 'missing', false, undefined],
      ['Rust', 'missing', false, undefined], // model skipped it → conservative missing
    ])
    const r = requirementFitResult(items)
    expect(r.score).toBe(30) // (1 + 0.5 + 0 + 0 + 0) / 5
    expect(r.details).toMatchObject({ met: 1, partial: 1, missing: 3, downgraded: 2 })
    expect(r.findings).toHaveLength(4)
    expect(r.findings[0]!.message).toContain('could not be found in your CV')
  })

  it('aligns paraphrased requirement text by order', () => {
    const items = verifyRequirementFit(
      ['5+ years of PostgreSQL'],
      [{ requirement: 'Postgres (5 years)', status: 'met', evidence: 'Led the PostgreSQL migration', suggestion: '' }],
      cvText,
    )
    expect(items[0]).toMatchObject({ requirement: '5+ years of PostgreSQL', status: 'met', evidenceVerified: true })
  })
})

describe('checkCvScoreSignal + runRequirementFit', () => {
  const longCv = cvToScorable({ kind: 'master_cv', cv: strongCv() })

  it('signal check', () => {
    expect(checkCvScoreSignal({ cvText: 'short', requirements: ['x'] })).toMatchObject({ ok: false, code: 'cv_score_cv_too_short' })
    expect(checkCvScoreSignal({ cvText: 'x'.repeat(400), requirements: [' '] })).toMatchObject({ ok: false, code: 'cv_score_no_requirements' })
    expect(checkCvScoreSignal({ cvText: 'x'.repeat(400), requirements: ['Go'] })).toEqual({ ok: true })
  })

  it('skips without AI or when disabled', async () => {
    const r = await runRequirementFit({ cv: longCv, target: backendJd(), ai: null, includeAi: true })
    expect(r.outcome).toMatchObject({ skipped: true, code: 'ai_disabled' })
  })

  it('skips (and reports) on a failed signal check', async () => {
    const codes: string[] = []
    const r = await runRequirementFit({
      cv: longCv,
      target: backendJd({ requirements: [] }),
      ai: new FixtureAIProvider(),
      includeAi: true,
      onSignalSkip: async (c) => {
        codes.push(c)
      },
    })
    expect(r.outcome).toMatchObject({ skipped: true, code: 'cv_score_no_requirements' })
    expect(codes).toEqual(['cv_score_no_requirements'])
  })

  it('runs the fixture provider deterministically', async () => {
    const r = await runRequirementFit({ cv: longCv, target: backendJd(), ai: new FixtureAIProvider(), includeAi: true })
    expect('skipped' in r.outcome).toBe(false)
    const again = await runRequirementFit({ cv: longCv, target: backendJd(), ai: new FixtureAIProvider(), includeAi: true })
    expect(again.outcome).toEqual(r.outcome)
  })

  it('an AI failure degrades to a skipped dimension', async () => {
    const ai = new FixtureAIProvider({ assessRequirementFit: () => { throw new Error('boom') } })
    const r = await runRequirementFit({ cv: longCv, target: backendJd(), ai, includeAi: true })
    expect(r.outcome).toMatchObject({ skipped: true, code: 'ai_error' })
  })

  it('a hallucinated quote cannot raise the score', async () => {
    const ai = new FixtureAIProvider({
      assessRequirementFit: (input) => ({
        items: input.requirements.map((requirement) => ({ requirement, status: 'met' as const, evidence: 'Invented quote', suggestion: '' })),
      }),
    })
    const r = await runRequirementFit({ cv: longCv, target: backendJd(), ai, includeAi: true })
    expect(r.outcome).toMatchObject({ score: 50, details: { met: 0, partial: 3, downgraded: 3 } })
  })
})

describe('autofix guards', () => {
  it('digit guard rejects invented numbers', () => {
    expect(rewriteRejection('Responsible for the billing API', 'Owned the billing API serving 10k users')).toBe(
      'rewrite adds numbers not in the original (10)',
    )
    expect(rewriteRejection('Helped cut costs by 20%', 'Cut costs by 20% by consolidating vendors')).toBeNull()
    expect(rewriteRejection('Worked on the API', 'Worked on the API')).toBe('rewrite is identical')
    expect(rewriteRejection('Worked on the API', 'Helped build the API')).toBe('rewrite still opens with a weak phrase')
    expect(rewriteRejection('Worked on the API', '  ')).toBe('empty rewrite')
  })

  it('skills can only be added with evidence elsewhere in the CV', () => {
    const cv = strongCv()
    expect(termEvidenced(cv, 'event-driven')).toBe(true)
    expect(addSkillRejection(cv, 'event-driven')).toBeNull()
    expect(addSkillRejection(cv, 'Rust')).toBe('no evidence of this skill elsewhere in the CV')
    expect(addSkillRejection(cv, 'postgres')).toBe('already listed in Skills')
  })

  it('applyChanges is immutable', () => {
    const cv = weakCv()
    const snapshot = JSON.parse(JSON.stringify(cv))
    const next = applyChanges(cv, [
      { kind: 'rewrite_bullet', findingId: 'f1', path: 'experience[0].bullets[0]', roleIndex: 0, bulletIndex: 0, before: 'Responsible for maintaining the website.', after: 'Maintained the website.' },
      { kind: 'add_skill', findingId: 'f2', path: 'skills.secondary', term: 'JavaScript', before: null, after: 'JavaScript' },
    ])
    expect(cv).toEqual(snapshot)
    expect(next.experience[0]!.bullets[0]).toBe('Maintained the website.')
    expect(next.skills.secondary).toEqual(['JavaScript'])
    expect(() => applyChanges(cv, [
      { kind: 'rewrite_bullet', findingId: 'f', path: 'x', roleIndex: 9, bulletIndex: 0, before: '', after: 'x' },
    ])).toThrow()
  })
})
