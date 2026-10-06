import { describe, expect, it } from 'vitest'
import { rewriteRejection } from '@/lib/cv-score/autofix'
import { chronologyInversions, classifyRole, experienceBreakdown } from '@/lib/cv-score/career'
import { computeCvScore } from '@/lib/cv-score/compute'
import { detectStuffing, scoreAts } from '@/lib/cv-score/dimensions/ats'
import { quantKind, scoreImpact, weakPhraseInside } from '@/lib/cv-score/dimensions/impact'
import { scoreSeniority } from '@/lib/cv-score/dimensions/seniority'
import { scoreStructure } from '@/lib/cv-score/dimensions/structure'
import { cvToScorable } from '@/lib/cv-score/extract'
import { toCvFitView } from '@/lib/cv-score/fit'
import { regionForJob, regionFromSearchPrefs, resolveRegion } from '@/lib/cv-score/region'
import { digitRuns } from '@/lib/cv-score/text'
import type { JobTarget, RegionHint, ScorableCv, ScorableRole } from '@/lib/cv-score/types'
import { SCORER_VERSION } from '@/lib/cv-score/version'
import { EMPTY_PREFS } from '@/lib/discovery/relevance/prefs'
import type { MasterCV } from '@/lib/documents/types'
import { backendJd, NOW, strongCv, stuffedCv, weakCv } from '@/tests/fixtures/cv-score/cvs'
import { TRICKY_LINKS, TRICKY_NOW, TRICKY_TEXT } from '@/tests/fixtures/cv-score/tricky'

const tricky = (): ScorableCv =>
  cvToScorable({ kind: 'upload', text: TRICKY_TEXT, fileType: 'pdf', pageCount: 2, links: TRICKY_LINKS })
const structured = (cv: MasterCV): ScorableCv => cvToScorable({ kind: 'master_cv', cv })
const GCC: RegionHint = { market: 'gcc', source: 'prefs', label: 'GCC' }
const US_REMOTE: RegionHint = { market: 'us', source: 'job', label: 'US remote', remote: true }
const role = (title: string, start: string, end: string): ScorableRole => ({ title, company: 'X', start, end, bullets: [] })
const DEMANDING = /\b(must|need to|needs to|have to|required)\b/i

describe('defect 3 — experience years', () => {
  it('classifies roles as engineering, internship or other', () => {
    expect(tricky().roles.map(classifyRole)).toEqual(['engineering', 'internship', 'other', 'internship'])
    expect(classifyRole(role('Engineering Manager', '2020-01', '2021-01'))).toBe('engineering')
    expect(classifyRole(role('Graduate Trainee', '2020-01', '2021-01'))).toBe('internship')
  })

  it('counts full-time engineering fully, internships at half, other roles not at all', () => {
    const b = experienceBreakdown(tricky().roles, TRICKY_NOW)
    expect(b).toMatchObject({ fullTimeMonths: 11, internshipMonths: 8, otherMonths: 17, totalMonths: 34, years: 1.3 })
  })

  it('merges overlapping intervals', () => {
    const b = experienceBreakdown([role('Engineer', '2021-06', '2022-06'), role('Developer', '2020-01', '2021-12')], NOW)
    expect(b.fullTimeMonths).toBe(30)
    expect(b.years).toBe(2.5)
  })

  it('does not double-count an internship that overlaps full-time work', () => {
    const b = experienceBreakdown([role('Engineer', '2022-01', '2022-12'), role('Intern', '2022-06', '2023-05')], NOW)
    expect(b.fullTimeMonths).toBe(12)
    expect(b.internshipMonths).toBe(5)
    expect(b.years).toBe(1.2)
  })

  it('counts every role for a CV with no engineering roles at all', () => {
    const b = experienceBreakdown([role('Teacher', '2020-01', '2021-12')], NOW)
    expect(b.years).toBe(2)
  })

  it('structure and seniority use the corrected figure and show the breakdown', () => {
    const s = scoreStructure(tricky(), { now: TRICKY_NOW })
    expect(s.details.years).toBe(1.3)
    const page = s.findings.find((f) => /pages?/.test(f.message) && /years/.test(f.message))
    expect(page?.message).toContain('1.3 years')
    expect(page?.suggestion ?? '').toMatch(/11 months full-time/)
    expect(page?.suggestion ?? '').toMatch(/8 months of internships counted at half/)
    expect(page?.suggestion ?? '').toMatch(/17 months in non-engineering roles not counted/)
    const sen = scoreSeniority(tricky(), backendJd(), { now: TRICKY_NOW })
    expect(sen.details.years).toBe(1.3)
    expect(sen.findings.find((f) => f.message.includes('Role asks for'))?.message).toContain('about 1.3')
  })
})

describe('defect 4 — reverse-chronological order', () => {
  it('accepts overlapping roles ordered by end date', () => {
    const s = scoreStructure(tricky(), { now: TRICKY_NOW })
    expect(s.details.reverseChronological).toBe(true)
    expect(s.findings.some((f) => f.message.includes('reverse-chronological'))).toBe(false)
  })

  it('accepts start-date ordering where an earlier-started role ended later', () => {
    expect(chronologyInversions([role('Engineer', '2021-01', '2022-12'), role('Engineer', '2019-01', '2023-06')], NOW)).toEqual([])
  })

  it('flags a real inversion, with "present" first', () => {
    expect(chronologyInversions([role('Engineer', '2018-01', '2019-12'), role('Engineer', '2020-01', 'present')], NOW)).toEqual([0])
    const cv = strongCv()
    const s = scoreStructure(structured({ ...cv, experience: [...cv.experience].reverse() }), { now: NOW })
    expect(s.details.reverseChronological).toBe(false)
    const f = s.findings.find((x) => x.message.includes('reverse-chronological'))
    expect(f?.evidence?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('defect 6 — keyword stuffing is relative to length and context', () => {
  it('a normal 2-page Laravel CV is not stuffing (skills + project stacks ignored)', () => {
    const cv = tricky()
    expect(cv.plainText.match(/laravel/gi)!.length).toBeGreaterThanOrEqual(8)
    expect(detectStuffing(cv)).toMatchObject({ terms: [], stuffed: false })
    expect(scoreAts(cv).findings.some((f) => f.message.startsWith('Keyword stuffing'))).toBe(false)
  })

  it('a term repeated within one passage is stuffing', () => {
    expect(detectStuffing(structured(stuffedCv()))).toMatchObject({ terms: ['kubernetes'], stuffed: true })
  })

  it('a term in nearly every bullet at high density is stuffing', () => {
    const bullets = Array.from({ length: 10 }, (_, i) => `Built Laravel module ${i + 1} with Laravel queues`)
    const cv = structured(strongCv({ experience: [{ company: 'A', role: 'Engineer', start: '2020-01', end: 'present', bullets }] }))
    const s = detectStuffing(cv)
    expect(s.stuffed).toBe(true)
    expect(s.terms).toContain('laravel')
  })
})

describe('defect 7 — region-aware advice', () => {
  it('reads the market from the job location, then from search preferences', () => {
    expect(regionForJob({ location: 'Dubai, United Arab Emirates' })).toMatchObject({ market: 'gcc', source: 'job' })
    expect(regionForJob({ location: 'Remote - US', remoteType: 'remote' })).toMatchObject({ market: 'us', remote: true })
    expect(regionForJob({ location: 'Bengaluru, India' })).toMatchObject({ market: 'india' })
    expect(regionForJob({ location: null })).toBeNull()
    expect(regionFromSearchPrefs({ ...EMPTY_PREFS, active: true, regions: ['AE', 'IN'] })).toMatchObject({ market: 'gcc', source: 'prefs' })
    expect(regionFromSearchPrefs({ ...EMPTY_PREFS, active: true, regions: ['IN'] })).toMatchObject({ market: 'india' })
    expect(regionFromSearchPrefs(EMPTY_PREFS)).toBeNull()
    const job: JobTarget = { ...backendJd(), location: 'Austin, TX, United States' }
    expect(resolveRegion(job, { region: GCC })).toMatchObject({ market: 'us', source: 'job' })
    expect(resolveRegion(null, { region: GCC })).toEqual(GCC)
  })

  it('GCC: explains why a phone with country code helps; 1–2 pages is fine', () => {
    const cv = tricky()
    const phone = scoreAts(cv, { region: GCC }).findings.find((f) => /phone/i.test(f.message))
    expect(phone).toMatchObject({ severity: 'minor' })
    expect(`${phone!.message} ${phone!.suggestion}`).toMatch(/GCC/)
    expect(phone!.suggestion).toMatch(/country code/)
    const s = scoreStructure(cv, { now: TRICKY_NOW, region: GCC })
    expect(s.details.pageLimit).toBe(2)
    expect(s.findings.some((f) => /pages?/.test(f.message) && /norm|typical/.test(f.message))).toBe(false)
  })

  it('GCC: a phone without a country code gets a gentle note', () => {
    const cv = { ...tricky(), contact: { ...tricky().contact, phone: '050 123 4567' } }
    const f = scoreAts(cv, { region: GCC }).findings.find((x) => /country code/i.test(`${x.message} ${x.suggestion}`))
    expect(f?.severity).toBe('minor')
  })

  it('US remote: no phone nagging; one page early in a career', () => {
    const cv = tricky()
    expect(scoreAts(cv, { region: US_REMOTE }).findings.some((f) => /phone/i.test(f.message))).toBe(false)
    const s = scoreStructure(cv, { now: TRICKY_NOW, region: US_REMOTE })
    expect(s.details.pageLimit).toBe(1)
    const page = s.findings.find((f) => /pages?/.test(f.message))
    expect(`${page!.message} ${page!.suggestion}`).toMatch(/US/)
  })

  it('wording explains why and never demands', () => {
    for (const region of [GCC, US_REMOTE, null]) {
      const r = computeCvScore({
        cv: tricky(),
        target: null,
        ctx: { now: TRICKY_NOW, canAutofix: false, region },
        source: { kind: 'upload', label: 't' },
      })
      for (const f of r.findings) expect(`${f.message} ${f.suggestion ?? ''}`).not.toMatch(DEMANDING)
    }
  })
})

describe('defect 8 — a weak phrase mid-bullet after a strong lead verb', () => {
  it('is a minor finding, not a weak opener', () => {
    const text = 'Extended payroll PDF processing to split merged files, and contributed to automated column mapping.'
    expect(weakPhraseInside(text)).toBe('contributed to')
    expect(weakPhraseInside('Contributed to the redesign of the platform')).toBeNull()
    const r = scoreImpact(tricky(), { canAutofix: true })
    expect(r.details.weakOpeners).toBe(0)
    const f = r.findings.find((x) => x.message.includes('contributed to'))
    expect(f).toMatchObject({ severity: 'minor', autoFixable: false })
    expect(f!.message).toContain('Extended')
    expect(f!.evidence!.some((e) => e.highlight === 'contributed to')).toBe(true)
  })

  it('a weak opener is still major', () => {
    const cv = structured(strongCv({
      experience: [{ company: 'A', role: 'Engineer', start: '2020-01', end: 'present', bullets: ['Contributed to the redesign of the billing platform'] }],
    }))
    expect(scoreImpact(cv, { canAutofix: false }).findings.find((f) => f.message.includes('weak phrase'))?.severity).toBe('major')
  })
})

describe('measurable outcome — scope vs outcome numbers', () => {
  it('classifies bullets', () => {
    expect(quantKind('Designed an access layer across 450 existing REST endpoints and 7 payment services')).toBe('scope')
    expect(quantKind('Reduced failed runs by 40% across 5 payment types')).toBe('outcome')
    expect(quantKind('Moved exports to background jobs, saving support 6 hours a week')).toBe('outcome')
    expect(quantKind('Cut rota preparation from 3 hours to 20 minutes a week')).toBe('outcome')
    expect(quantKind('Saved $8k per month in infrastructure spend')).toBe('outcome')
    expect(quantKind('Doubled throughput of the ingest pipeline')).toBe('outcome')
    expect(quantKind('Joined in 2019 and rebuilt billing')).toBeNull()
    expect(quantKind('Supported thousands of merchants')).toBe('scope')
  })

  it('reports scope and outcome separately; scope still counts as quantified', () => {
    const r = scoreImpact(tricky(), { canAutofix: false })
    expect(r.details).toMatchObject({ bullets: 14, quantified: 7, quantifiedScope: 4, quantifiedOutcome: 3 })
    const none = r.findings.find((f) => f.message.includes('have no number'))
    expect(none?.message).toBe('7 of 14 bullets have no number (scope or outcome)')
    expect(r.findings.some((f) => f.message.includes('lack a measurable outcome'))).toBe(false)
  })
})

describe('every finding cites exact lines', () => {
  it('evidence points at real lines of the source', () => {
    const cv = tricky()
    const r = computeCvScore({ cv, target: null, ctx: { now: TRICKY_NOW, canAutofix: false, region: GCC }, source: { kind: 'upload', label: 't' } })
    expect(r.findings.length).toBeGreaterThan(0)
    for (const f of r.findings) {
      expect(f.evidence?.length, f.message).toBeGreaterThan(0)
      for (const e of f.evidence!) {
        expect(cv.lines![e.index]!.trim()).toBe(e.text)
        if (e.highlight) expect(e.text.toLowerCase()).toContain(e.highlight.toLowerCase())
      }
    }
  })

  it('structured CVs cite the rendered line of the bullet', () => {
    const cv = structured(weakCv())
    const r = scoreImpact(cv, { canAutofix: true })
    const f = r.findings.find((x) => x.message.includes('"responsible for"'))!
    expect(f.evidence![0]!.text).toBe('• Responsible for maintaining the website.')
    expect(f.evidence![0]!.highlight).toBe('Responsible for')
  })
})

describe('fact-lock — suggestions never invent numbers', () => {
  it('every rewrite suggestion only uses numbers from its source bullet', () => {
    const sources = [structured(weakCv()), structured(strongCv()), tricky()]
    for (const cv of sources) {
      const r = scoreImpact(cv, { canAutofix: true })
      for (const f of r.findings) {
        if (!f.suggestion?.startsWith('Consider:')) continue
        const bullet = cv.bullets[f.location!.index!]!.text
        const allowed = new Set(digitRuns(bullet))
        expect(digitRuns(f.suggestion).filter((d) => !allowed.has(d))).toEqual([])
      }
    }
  })

  it('the autofix guard rejects invented digits and spelled-out numbers', () => {
    expect(rewriteRejection('Responsible for the billing API', 'Owned the billing API, cutting errors by 40%')).toMatch(/numbers/)
    expect(rewriteRejection('Responsible for the billing API', 'Owned the billing API for three product teams')).toMatch(/numbers/)
    expect(rewriteRejection('Responsible for the billing API for 3 teams', 'Owned the billing API for 3 teams')).toBeNull()
  })
})

describe('scorer version', () => {
  it('is bumped, and older stored scores are marked as such', () => {
    expect(SCORER_VERSION).toBe('1.1.0')
    const row = (id: string, overall: number, v: string) => ({
      id, overall, grade: 'C', mode: 'general', sourceLabel: 'CV', scores: {}, createdAt: new Date(NOW), scorerVersion: v,
    })
    const view = toCvFitView([row('b', 70, '1.0.0'), row('a', 60, '1.0.0')])
    expect(view).toMatchObject({ outdated: true, scorerVersion: '1.0.0', delta: 10 })
    const mixed = toCvFitView([row('b', 70, SCORER_VERSION), row('a', 60, '1.0.0')])
    expect(mixed).toMatchObject({ outdated: false, delta: null })
  })
})
