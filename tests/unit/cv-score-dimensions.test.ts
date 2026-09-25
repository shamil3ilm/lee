import { describe, expect, it } from 'vitest'
import { cvToScorable } from '@/lib/cv-score/extract'
import { scoreImpact, isQuantified, weakOpenerOf, rewriteSkeleton } from '@/lib/cv-score/dimensions/impact'
import { scoreAts } from '@/lib/cv-score/dimensions/ats'
import { scoreStructure } from '@/lib/cv-score/dimensions/structure'
import { scoreReadability, isPassive, isPresentTenseOpener } from '@/lib/cv-score/dimensions/readability'
import { jdTerms, scoreKeywords, type KeywordDetails } from '@/lib/cv-score/dimensions/keywords'
import { requiredYearsFromJd, scoreSeniority } from '@/lib/cv-score/dimensions/seniority'
import { detectIndustries, scoreDomain } from '@/lib/cv-score/dimensions/domain'
import { roleFamily, scoreRoleAlignment } from '@/lib/cv-score/dimensions/role-alignment'
import { isSkipped, type DimensionResult, type ScorableCv } from '@/lib/cv-score/types'
import type { MasterCV } from '@/lib/documents/types'
import {
  backendJd,
  NO_CONTACT_TEXT,
  NOW,
  strongCv,
  stuffedCv,
  TWO_COLUMN_TEXT,
  weakCv,
} from '@/tests/fixtures/cv-score/cvs'

const structured = (cv: MasterCV): ScorableCv => cvToScorable({ kind: 'master_cv', cv })
const ctx = { now: NOW, canAutofix: true }

function expectResult<T>(d: DimensionResult<T> | { skipped: true }): DimensionResult<T> {
  if (isSkipped(d as never)) throw new Error('unexpected skip')
  return d as DimensionResult<T>
}

describe('impact', () => {
  it('scores a strong CV 100 with no findings', () => {
    const r = scoreImpact(structured(strongCv()), ctx)
    expect(r.score).toBe(100)
    expect(r.details).toEqual({ bullets: 10, quantified: 10, quantifiedRatio: 1, strongVerbRatio: 1, weakOpeners: 0 })
    expect(r.findings).toEqual([])
  })

  it('scores a weak CV 11 and flags each weak opener with a fix payload', () => {
    const r = scoreImpact(structured(weakCv()), ctx)
    expect(r.score).toBe(11)
    expect(r.details).toEqual({ bullets: 6, quantified: 0, quantifiedRatio: 0, strongVerbRatio: 0.17, weakOpeners: 4 })
    const weak = r.findings.filter((f) => f.fix?.kind === 'rewrite_bullet')
    expect(weak.map((f) => f.fix)).toEqual([
      { kind: 'rewrite_bullet', roleIndex: 0, bulletIndex: 0 },
      { kind: 'rewrite_bullet', roleIndex: 0, bulletIndex: 1 },
      { kind: 'rewrite_bullet', roleIndex: 0, bulletIndex: 2 },
      { kind: 'rewrite_bullet', roleIndex: 1, bulletIndex: 0 },
    ])
    expect(weak.every((f) => f.autoFixable && f.severity === 'major' && f.headlines.includes('impact'))).toBe(true)
    const quant = r.findings.find((f) => f.message.includes('lack a measurable outcome'))
    expect(quant).toMatchObject({ severity: 'major', message: '6 of 6 bullets lack a measurable outcome' })
    expect(r.findings).toHaveLength(5)
  })

  it('never marks findings autoFixable for non-master sources', () => {
    const r = scoreImpact(structured(weakCv()), { canAutofix: false })
    expect(r.findings.some((f) => f.autoFixable || f.fix)).toBe(false)
  })

  it('is deterministic (same ids and output twice)', () => {
    expect(scoreImpact(structured(weakCv()), ctx)).toEqual(scoreImpact(structured(weakCv()), ctx))
  })

  it('helpers: quantification ignores bare years; weak openers; rewrite skeleton', () => {
    expect(isQuantified('Joined in 2019 and rebuilt billing')).toBe(false)
    expect(isQuantified('Cut costs by 40%')).toBe(true)
    expect(isQuantified('Doubled throughput')).toBe(true)
    expect(weakOpenerOf('Helped to ship the app')).toBe('helped to')
    expect(weakOpenerOf('Led the team')).toBeNull()
    expect(rewriteSkeleton('Responsible for the billing API.', 'responsible for')).toBe(
      'Consider: "Owned the billing API — resulting in <measurable outcome: %, $, time saved, users>"',
    )
  })

  it('reports a critical finding when there are no bullets', () => {
    const r = scoreImpact(structured(strongCv({ experience: [] })), ctx)
    expect(r.score).toBe(0)
    expect(r.findings[0]!.severity).toBe('critical')
  })
})

describe('ats', () => {
  it('gives a clean structured CV full marks', () => {
    const r = scoreAts(structured(strongCv()))
    expect(r.score).toBe(100)
    expect(r.details.checks.every((c) => c.points === c.max)).toBe(true)
    expect(r.details.stuffing).toEqual({ terms: [], skillsListed: 8, stuffed: false })
  })

  it('weak CV loses contact + heading points (87)', () => {
    const r = scoreAts(structured(weakCv()))
    expect(r.score).toBe(87)
    expect(r.findings.map((f) => f.message)).toEqual([
      'Missing standard section(s): Education',
      'Contact details missing: phone, LinkedIn URL, location',
    ])
  })

  it('missing email is critical and caps the score at 60', () => {
    const r = scoreAts(cvToScorable({ kind: 'upload', text: NO_CONTACT_TEXT, fileType: 'txt' }))
    expect(r.findings[0]).toMatchObject({ severity: 'major', message: 'Only 362 characters of text could be extracted' })
    expect(r.findings.find((f) => f.severity === 'critical')!.message).toBe('No email address detected')
    expect(r.score).toBe(60)
  })

  it('penalises a two-column PDF layout (53)', () => {
    const r = scoreAts(cvToScorable({ kind: 'upload', text: TWO_COLUMN_TEXT, fileType: 'pdf', pageCount: 1 }))
    expect(r.score).toBe(53)
    const layout = r.details.checks.find((c) => c.key === 'layout')
    expect(layout).toEqual({ key: 'layout', label: 'Single-column layout', points: 0, max: 15 })
    expect(r.findings.some((f) => f.message.startsWith('Multi-column layout suspected'))).toBe(true)
  })

  it('detects keyword stuffing', () => {
    const r = scoreAts(structured(stuffedCv()))
    expect(r.details.stuffing).toEqual({ terms: ['kubernetes'], skillsListed: 46, stuffed: true })
    expect(r.score).toBe(90)
    expect(r.findings.some((f) => f.message.startsWith('Keyword stuffing suspected'))).toBe(true)
  })
})

describe('structure', () => {
  it('strong CV: 100, 9.8 years, no gaps', () => {
    const r = scoreStructure(structured(strongCv()), { now: NOW })
    expect(r.score).toBe(100)
    expect(r.details).toMatchObject({ years: 9.8, pages: 1, pageLimit: 2, reverseChronological: true, gaps: [], bulletsPerRole: [4, 3, 3] })
  })

  it('weak CV: gap + thin role (91)', () => {
    const r = scoreStructure(structured(weakCv()), { now: NOW })
    expect(r.score).toBe(91)
    expect(r.details.gaps).toEqual([{ between: 'Beta → Acme', months: 18 }])
  })

  it('flags non reverse-chronological order', () => {
    const cv = strongCv()
    const reversed = { ...cv, experience: [...cv.experience].reverse() }
    const r = scoreStructure(structured(reversed), { now: NOW })
    expect(r.details.reverseChronological).toBe(false)
    expect(r.score).toBe(85)
  })

  it('penalises length for a junior CV', () => {
    const cv = structured(strongCv({
      experience: [{ company: 'A', role: 'Engineer', start: '2025-06', end: 'present', bullets: ['Built a', 'Built b', 'Built c'] }],
    }))
    const long: ScorableCv = { ...cv, meta: { ...cv.meta, pageCountEstimate: 3 } }
    const r = scoreStructure(long, { now: NOW })
    expect(r.details.pageLimit).toBe(1)
    expect(r.findings[0]).toMatchObject({ severity: 'major' })
    expect(r.score).toBe(85)
  })

  it('no roles → 30 with a critical finding', () => {
    const r = scoreStructure(cvToScorable({ kind: 'upload', text: TWO_COLUMN_TEXT, fileType: 'pdf' }), { now: NOW })
    expect(r.score).toBe(30)
    expect(r.findings[0]!.severity).toBe('critical')
  })

  it('flags Education before Experience for experienced candidates', () => {
    const text = [
      'Casey', 'casey@example.com', 'Education', 'BSc, MIT, 2008 - 2012',
      'Experience', 'Engineer, Acme, Jan 2012 - Present', '• Built a thing that did stuff for users', '• Built b', '• Built c',
    ].join('\n')
    const r = scoreStructure(cvToScorable({ kind: 'upload', text, fileType: 'txt' }), { now: NOW })
    expect(r.findings.map((f) => f.message)).toContain('Education appears before Experience')
  })
})

describe('readability', () => {
  it('strong CV reads cleanly (100)', () => {
    const r = scoreReadability(structured(strongCv()))
    expect(r.score).toBe(100)
    expect(r.findings).toEqual([])
  })

  it('weak CV: short bullets, passive voice, tense and pronouns (47)', () => {
    const r = scoreReadability(structured(weakCv()))
    expect(r.score).toBe(47)
    expect(r.details).toEqual({
      bullets: 6,
      avgWords: 5.7,
      inRangeRatio: 0,
      passiveRatio: 0.17,
      repeatedOpeners: [],
      repeatedWords: [],
      pastRoleTenseIssues: 1,
      pronounBullets: 1,
    })
    expect(r.findings).toHaveLength(4)
  })

  it('helpers', () => {
    expect(isPassive('Latency was reduced by 40%')).toBe(true)
    expect(isPassive('Reduced latency by 40%')).toBe(false)
    expect(isPresentTenseOpener('Manages the team')).toBe(true)
    expect(isPresentTenseOpener('Managing vendors')).toBe(true)
    expect(isPresentTenseOpener('Managed the team')).toBe(false)
    expect(isPresentTenseOpener('Cut costs')).toBe(false)
  })

  it('flags repeated openers', () => {
    const cv = strongCv({
      experience: [{
        company: 'A', role: 'Engineer', start: '2020-01', end: 'present',
        bullets: [
          'Built the billing service used by twelve internal teams every single day',
          'Built the reporting pipeline feeding finance dashboards with hourly refreshed data',
          'Built the audit trail storing every ledger mutation for seven years of retention',
        ],
      }],
    })
    const r = scoreReadability(structured(cv))
    expect(r.details.repeatedOpeners).toEqual(['built'])
    // length 2/3 in range (26.67) + passive 20 + repetition 10 + tense 15 + pronouns 10
    expect(r.score).toBe(82)
  })
})

describe('keywords', () => {
  it('extracts required vs nice-to-have JD terms', () => {
    expect(jdTerms(backendJd())).toEqual({
      required: ['aws', 'event-driven', 'kafka', 'payments', 'postgresql', 'typescript'],
      niceToHave: ['rust'],
    })
  })

  it('classifies matched / partial / missing with locations', () => {
    const r = expectResult(scoreKeywords(structured(strongCv()), backendJd(), ctx)) as DimensionResult<KeywordDetails>
    expect(r.score).toBe(81)
    expect(r.details.required).toEqual([
      { term: 'aws', status: 'missing', where: [] },
      { term: 'event-driven', status: 'matched', where: ['experience'] },
      { term: 'kafka', status: 'matched', where: ['experience', 'skills'] },
      { term: 'payments', status: 'matched', where: ['experience'] },
      { term: 'postgresql', status: 'matched', where: ['experience', 'summary', 'skills'] },
      { term: 'typescript', status: 'matched', where: ['experience', 'summary', 'skills'] },
    ])
    expect(r.details.niceToHave).toEqual([{ term: 'rust', status: 'partial', where: [], via: 'go' }])
    expect(r.details.presence).toBe(0.83)
    expect(r.findings.map((f) => [f.severity, f.message, f.autoFixable])).toEqual([
      ['minor', '1 of 6 required skills are missing: aws', false],
      ['minor', '"event-driven" appears in your experience but not in your Skills list', true],
      ['minor', '"payments" appears in your experience but not in your Skills list', true],
    ])
    const fix = r.findings.find((f) => f.fix?.kind === 'add_skill')
    expect(fix?.headlines).toEqual(['skillsMatch', 'ats'])
  })

  it('treats skills-only mentions as partial', () => {
    const r = expectResult(
      scoreKeywords(cvToScorable({ kind: 'upload', text: NO_CONTACT_TEXT, fileType: 'txt' }), backendJd(), ctx),
    ) as DimensionResult<KeywordDetails>
    expect(r.details.required.find((h) => h.term === 'aws')).toEqual({ term: 'aws', status: 'partial', where: ['skills'] })
    expect(r.findings.map((f) => f.severity)).toEqual(['critical', 'minor', 'minor'])
  })

  it('skips when the JD has no recognisable skills', () => {
    const r = scoreKeywords(structured(strongCv()), backendJd({ techStack: [], requirements: ['Be kind'], descriptionMd: 'Nice people.', niceToHave: [] }), ctx)
    expect(r).toMatchObject({ skipped: true, code: 'no_jd_skills' })
  })

  it('synonyms: Postgres in the JD matches PostgreSQL in the CV', () => {
    const r = expectResult(
      scoreKeywords(structured(strongCv()), backendJd({ techStack: ['postgres'], requirements: [], descriptionMd: '', niceToHave: [] }), ctx),
    ) as DimensionResult<KeywordDetails>
    expect(r.score).toBe(100)
  })
})

describe('seniority', () => {
  it('parses required years from the JD', () => {
    expect(requiredYearsFromJd(backendJd())).toBe(5)
    expect(requiredYearsFromJd(backendJd({ requirements: ['3-5 years with Go', '7+ yrs overall'] }))).toBe(3)
    expect(requiredYearsFromJd(backendJd({ requirements: [], descriptionMd: 'No numbers' }))).toBeNull()
  })

  it('senior CV vs senior JD: 100', () => {
    const r = scoreSeniority(structured(strongCv()), backendJd(), ctx)
    expect(r.score).toBe(100)
    expect(r.details).toMatchObject({ years: 9.8, requiredYears: 5, jdLevel: 'senior', cvLevel: 'senior', scopeSignals: 3 })
  })

  it('junior CV vs senior JD: short on years and scope', () => {
    const junior = strongCv({
      experience: [{
        company: 'Start', role: 'Junior Developer', start: '2025-01', end: 'present',
        bullets: ['Built internal dashboards in React for the support team', 'Fixed 30 bugs in the checkout flow'],
      }],
    })
    const r = scoreSeniority(structured(junior), backendJd(), ctx)
    expect(r.details).toMatchObject({ years: 1.8, yearsScore: 36, scopeSignals: 0, scopeScore: 0, cvLevel: 'junior' })
    expect(r.score).toBe(23)
    expect(r.findings[0]).toMatchObject({ severity: 'major', message: 'Role asks for 5+ years; your CV shows about 1.8' })
  })

  it('flags over-qualification for junior roles', () => {
    const r = scoreSeniority(structured(strongCv()), backendJd({ title: 'Junior Backend Engineer', seniority: 'junior', requirements: [] }), ctx)
    expect(r.details.yearsScore).toBe(80)
    expect(r.findings[0]!.message).toContain('over-qualified')
  })
})

describe('domain', () => {
  it('detects industries', () => {
    expect(detectIndustries('We build payments and banking rails')).toEqual(['fintech'])
    expect(detectIndustries('hello world')).toEqual([])
  })

  it('strong / related / none', () => {
    const cv = structured(strongCv())
    expect(expectResult(scoreDomain(cv, backendJd(), {})).score).toBe(100)
    const crypto = backendJd({ descriptionMd: 'A crypto exchange built on blockchain rails', companyName: 'Coin' })
    const plain = structured(strongCv({ summary: 'Engineer.', experience: [] }))
    expect(expectResult(scoreDomain(plain, crypto, { profile: { industries: ['fintech'] } })).details).toEqual({
      jdIndustries: ['crypto'],
      cvIndustries: ['fintech'],
      match: 'related',
    })
    expect(expectResult(scoreDomain(plain, crypto, {})).score).toBe(25)
    expect(scoreDomain(cv, backendJd({ descriptionMd: 'Great team', companyName: 'X' }), {})).toMatchObject({ skipped: true })
  })
})

describe('role alignment', () => {
  it('families', () => {
    expect(roleFamily('Senior Backend Engineer')).toBe('backend')
    expect(roleFamily('Site Reliability Engineer')).toBe('devops')
    expect(roleFamily('iOS Developer')).toBe('mobile')
  })

  it('strong CV aligns fully; weak CV only by family', () => {
    expect(scoreRoleAlignment(structured(strongCv()), backendJd()).score).toBe(100)
    const weak = scoreRoleAlignment(structured(weakCv()), backendJd())
    expect(weak.details).toMatchObject({ titleScore: 70, responsibilitiesCovered: 0, responsibilitiesTotal: 2 })
    expect(weak.score).toBe(35)
  })
})
