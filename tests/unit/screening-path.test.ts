import { describe, expect, it } from 'vitest'
import { renderedEvidence } from '@/lib/cv-fit/evidence'
import { atsStatus } from '@/lib/screening/ats'
import { screeningPath } from '@/lib/screening/path'
import { recencyWeight, relevantYears } from '@/lib/screening/recruiter'
import { chipText, compactPath, stageStatus } from '@/lib/screening/stage'
import type { ScreeningPath, StageKey } from '@/lib/screening/types'
import { renderVariant } from '@/lib/variants/render'
import { TAILOR_JD, tailorProfile, tailorRecipe } from '@/tests/fixtures/resume/tailor'
import { gccJob, SCREEN_NOW, screenInput, screenResume, screenUser, VARIANT_NAME } from '@/tests/fixtures/screening'

const stage = (p: ScreeningPath, key: StageKey) => p.stages.find((s) => s.stage === key)!
const check = (p: ScreeningPath, key: StageKey, checkKey: string) => stage(p, key).checks.find((c) => c.key === checkKey)
const path = (...args: Parameters<typeof screenInput>) => screeningPath(screenInput(...args))

const withDescription = (extra: string, over: Parameters<typeof gccJob>[0] = {}) =>
  gccJob({ ...over, descriptionMd: `${gccJob().descriptionMd}\n${extra}` })

describe('stage rules', () => {
  it('a stage is its worst check; unknown never lowers a pass to fail', () => {
    expect(stageStatus('recruiter', [{ key: 'a', status: 'pass', reason: '' }, { key: 'b', status: 'unknown', reason: '' }])).toBe('unknown')
    expect(stageStatus('recruiter', [{ key: 'a', status: 'at_risk', reason: '' }, { key: 'b', status: 'fail', reason: '' }])).toBe('fail')
  })

  it('two unknowns make the eligibility stage at risk', () => {
    const two = [
      { key: 'visa', status: 'unknown' as const, reason: '' },
      { key: 'notice', status: 'unknown' as const, reason: '' },
    ]
    expect(stageStatus('eligibility', two)).toBe('at_risk')
    expect(stageStatus('ats', two)).toBe('unknown')
  })
})

describe('(a) eligibility', () => {
  it('visa offered for a GCC role you need sponsorship for passes', () => {
    const p = path(gccJob())
    expect(check(p, 'eligibility', 'visa')).toMatchObject({ status: 'pass', reason: 'Visa offered for UAE' })
    expect(stage(p, 'eligibility').status).toBe('pass')
  })

  it('nationals only is a knockout, named on the chip', () => {
    const p = path(withDescription('Emiratisation role. UAE nationals only.'))
    expect(stage(p, 'eligibility').status).toBe('fail')
    expect(chipText(p)?.text).toBe('Knockout: nationals only')
  })

  it('"must already hold a visa" fails; "candidates in the UAE preferred" is only at risk', () => {
    const hold = path(gccJob({ descriptionMd: 'Requirements: PHP, Laravel. Must hold a transferable visa.' }))
    expect(check(hold, 'eligibility', 'visa')?.status).toBe('fail')
    const local = path(gccJob({ descriptionMd: 'Requirements: PHP, Laravel. Candidates in the UAE preferred.' }))
    expect(check(local, 'eligibility', 'visa')).toMatchObject({ status: 'at_risk', short: 'in-UAE preferred' })
    expect(check(local, 'eligibility', 'visa')?.action?.kind).toBe('prepare')
  })

  it('visa not mentioned is unknown with a question to ask; a second unknown makes the stage at risk', () => {
    const one = path(gccJob({ descriptionMd: 'Requirements: PHP and Laravel.' }))
    expect(check(one, 'eligibility', 'visa')).toMatchObject({ status: 'unknown', action: { kind: 'ask' } })
    expect(stage(one, 'eligibility').status).toBe('unknown')
    const noNotice = screenUser({ discoveryPrefs: { basedIn: 'IN', sponsorshipFor: ['AE'], noticePeriods: [] } } as never)
    const two = path(gccJob({ descriptionMd: 'Requirements: PHP and Laravel. Immediate joiners preferred.' }), { user: noNotice })
    expect(stage(two, 'eligibility').status).toBe('at_risk')
  })

  it('notice: an immediate-joiner ask is at risk on a 1-month notice and passes for an immediate joiner', () => {
    const job = withDescription('Immediate joiners only.')
    expect(check(path(job), 'eligibility', 'notice')).toMatchObject({ status: 'at_risk', short: 'notice period' })
    const immediate = screenUser({ discoveryPrefs: { basedIn: 'IN', sponsorshipFor: ['AE'], noticePeriods: ['immediate', '1_month'] } } as never)
    expect(check(path(job, { user: immediate }), 'eligibility', 'notice')?.status).toBe('pass')
    expect(chipText(path(job))?.text).toBe('At risk: notice period')
  })

  it('degree: mandatory with none on the profile is at risk; held passes; a higher level required fails', () => {
    const job = withDescription('BE/BTech in Computer Science is mandatory.')
    expect(check(path(job), 'eligibility', 'degree')?.status).toBe('at_risk')
    const graduate = screenUser({}, screenResume({ education: [{ id: 'e1', institution: 'College of Example', studyType: 'B.Tech', area: 'Computer Science' }] }))
    expect(check(path(job, { user: graduate }), 'eligibility', 'degree')?.status).toBe('pass')
    const master = withDescription("Master's degree in Computer Science is mandatory.")
    expect(check(path(master, { user: graduate }), 'eligibility', 'degree')?.status).toBe('fail')
  })

  it('attestation asks are at risk with the attestation chain as the action', () => {
    const c = check(path(withDescription('Attested degree certificates required.')), 'eligibility', 'attestation')
    expect(c?.status).toBe('at_risk')
    expect(c?.action?.label).toMatch(/MOFA/)
  })

  it('Oman bars expat programmers from 2026: a knockout', () => {
    const p = path(gccJob({ title: 'Software Programmer', location: 'Muscat, Oman' }))
    expect(check(p, 'eligibility', 'profession_ban')).toMatchObject({ status: 'fail' })
    expect(chipText(p)?.text).toBe('Knockout: Oman expat ban')
  })

  it('Kuwait and Saudi "Engineer" titles are at risk with the KSE / SCE reason, never fail', () => {
    const kw = check(path(gccJob({ title: 'Software Engineer', location: 'Kuwait City, Kuwait' })), 'eligibility', 'permit_title')
    expect(kw).toMatchObject({ status: 'at_risk' })
    expect(kw?.reason).toMatch(/Kuwait Society of Engineers/)
    expect(kw?.reason).toMatch(/NBA/)
    expect(kw?.action?.label).toMatch(/Software Developer/)
    const sa = check(path(gccJob({ title: 'Backend Engineer', location: 'Riyadh, Saudi Arabia' })), 'eligibility', 'permit_title')
    expect(sa?.status).toBe('at_risk')
    expect(sa?.reason).toMatch(/Saudi Council of Engineers/)
    expect(check(path(gccJob({ title: 'Software Developer', location: 'Kuwait City, Kuwait' })), 'eligibility', 'permit_title')).toBeUndefined()
  })

  it('a mandatory language you do not speak fails', () => {
    const p = path(withDescription('Arabic fluency is mandatory.'))
    expect(check(p, 'eligibility', 'language')).toMatchObject({ status: 'fail', short: 'Arabic mandatory' })
  })

  it('a remote posting has no visa or permit-title checks', () => {
    const p = path(gccJob({ title: 'Software Engineer', location: 'Remote', remoteType: 'remote' }))
    expect(check(p, 'eligibility', 'visa')).toBeUndefined()
    expect(check(p, 'eligibility', 'permit_title')).toBeUndefined()
  })
})

describe('(b) ATS keywords against the CV you would send', () => {
  it('buckets terms: present, addable honestly (you have it), missing (study, never a keyword)', () => {
    const p = path({ ...TAILOR_JD })
    const ats = stage(p, 'ats')
    expect(check(p, 'ats', 'keyword:php')?.status).toBe('pass')
    const pg = check(p, 'ats', 'keyword:postgresql')
    expect(pg).toMatchObject({ status: 'fail', action: { kind: 'study' } })
    expect(ats.checks.filter((c) => c.action?.kind === 'add_keyword').map((c) => c.key)).not.toContain('keyword:postgresql')
    expect(ats.summary).toMatch(new RegExp(`in “${VARIANT_NAME}”`))
    expect(chipText({ stages: p.stages.filter((s) => s.stage !== 'eligibility') })?.text).toBe('ATS: 3 must-haves missing')
  })

  it('a skill with ready evidence the CV leaves out is "addable", naming where you have it', () => {
    const c = check(path(gccJob()), 'ats', 'keyword:mysql')
    expect(c).toMatchObject({ status: 'at_risk', action: { kind: 'add_keyword' } })
    expect(c?.action?.label).toMatch(/Tuned MySQL queries/)
  })

  it('without a variant the profile stands in and nothing is "addable"', () => {
    const p = path(gccJob(), { variant: null })
    expect(stage(p, 'ats').summary).toMatch(/your profile \(no CV variant yet\)/)
    expect(stage(p, 'ats').checks.some((c) => c.action?.kind === 'add_keyword')).toBe(false)
  })

  it('implied skills are not literal: a CV that says only Laravel does not show "PHP"', () => {
    const variant = { name: 'Laravel only', evidence: { skills: new Set(['laravel', 'php']), evidence: ['Skills: Laravel'] } }
    const p = path(gccJob({ descriptionMd: '## Requirements\n- Strong PHP.\n- Laravel.' }), { variant })
    expect(check(p, 'ats', 'keyword:php')?.status).toBe('at_risk')
    expect(check(p, 'ats', 'keyword:laravel')?.status).toBe('pass')
  })

  it('status thresholds: pass ≥ 0.7 as is, at risk when fixable, fail < 0.5 even after fixes', () => {
    expect(atsStatus({ now: 0.7, after: 0.7 })).toBe('pass')
    expect(atsStatus({ now: 0.4, after: 0.8 })).toBe('at_risk')
    expect(atsStatus({ now: 0.5, after: 0.6 })).toBe('at_risk')
    expect(atsStatus({ now: 0.3, after: 0.45 })).toBe('fail')
  })

  it('no JD yet: unknown, with the reason', () => {
    const p = path(gccJob({ descriptionMd: '' }))
    expect(stage(p, 'ats')).toMatchObject({ status: 'unknown', summary: expect.stringMatching(/No JD yet/) })
  })

  it('monotonic: adding a must-have term to the CV never lowers stage (b)', () => {
    const resume = screenResume()
    const base = renderedEvidence(renderVariant(resume, tailorRecipe()))
    const before = stage(path(gccJob(), { variant: { name: 'v', evidence: base } }), 'ats')
    const more = { skills: base.skills, evidence: [...base.evidence, 'Skills: MySQL'] }
    const after = stage(path(gccJob(), { variant: { name: 'v', evidence: more } }), 'ats')
    expect(check({ stages: [after], v: '', next: [] } as ScreeningPath, 'ats', 'keyword:mysql')?.status).toBe('pass')
    const rank = { fail: 0, at_risk: 1, unknown: 1, pass: 2 } as const
    expect(rank[after.status]).toBeGreaterThanOrEqual(rank[before.status])
    expect(after.score).toBeGreaterThanOrEqual(before.score)
  })
})

describe('(c) recruiter', () => {
  it('recency weights: last 3 years ×1, 3–6 years ×0.6, older ×0.3', () => {
    expect([recencyWeight(0), recencyWeight(35), recencyWeight(36), recencyWeight(71), recencyWeight(72)]).toEqual([1, 1, 0.6, 0.6, 0.3])
  })

  it('relevant years count only roles naming the JD skills, recent months full weight', () => {
    const resume = tailorProfile()
    // PayCo (Laravel, 2022-01 → now) only: 58 months, the last 36 at ×1 and 22 at ×0.6.
    expect(relevantYears(resume, new Set(['laravel']), SCREEN_NOW)).toBeCloseTo((36 + 22 * 0.6) / 12, 1)
    // Both roles count when nothing specific is asked.
    expect(relevantYears(resume, new Set(), SCREEN_NOW)).toBeGreaterThan(relevantYears(resume, new Set(['laravel']), SCREEN_NOW))
    expect(relevantYears(null, new Set(['php']), SCREEN_NOW)).toBe(0)
  })

  it('title alignment: same / adjacent family passes, another tech family is at risk, a non-tech title fails', () => {
    expect(check(path(gccJob()), 'recruiter', 'title')?.status).toBe('pass')
    expect(check(path(gccJob({ title: 'Full Stack Developer' })), 'recruiter', 'title')?.status).toBe('pass')
    const analyst = screenUser({}, screenResume({ work: [{ ...tailorProfile().work[0]!, position: 'Data Analyst' }] }))
    expect(check(path(gccJob(), { user: analyst }), 'recruiter', 'title')?.status).toBe('at_risk')
    const clerk = screenUser({}, screenResume({ work: [{ ...tailorProfile().work[0]!, position: 'Accounts Clerk' }] }))
    expect(check(path(gccJob(), { user: clerk }), 'recruiter', 'title')?.status).toBe('fail')
  })

  it('relevant years far below the ask fail the stage; near the ask they pass', () => {
    const tenPlus = gccJob({ descriptionMd: '## Requirements\n- 10+ years of experience with PHP and Laravel.' })
    expect(check(path(tenPlus), 'recruiter', 'years')).toMatchObject({ status: 'fail', short: 'years asked' })
    expect(stage(path(tenPlus), 'recruiter').status).toBe('fail')
    expect(check(path(gccJob()), 'recruiter', 'years')?.status).toBe('pass')
  })

  it('monotonic: one more relevant year never lowers stage (c)', () => {
    const job = gccJob({ descriptionMd: '## Requirements\n- 6+ years of experience with PHP and Laravel.' })
    const base = tailorProfile()
    const earlier = screenUser({}, screenResume({ work: [{ ...base.work[0]!, startDate: '2021-01' }, base.work[1]] }))
    const rank = { fail: 0, at_risk: 1, unknown: 1, pass: 2 } as const
    const a = stage(path(job), 'recruiter')
    const b = stage(path(job, { user: earlier }), 'recruiter')
    expect(rank[b.status]).toBeGreaterThanOrEqual(rank[a.status])
    expect(b.score).toBeGreaterThanOrEqual(a.score)
  })

  it('few quantified bullets and gaps are "be ready" items: at risk, never a fail on their own', () => {
    const variant = { name: 'plain', evidence: { skills: new Set(['php']), evidence: ['Built APIs.', 'Wrote tests.', 'Fixed bugs.', 'Skills: PHP'] } }
    expect(check(path(gccJob(), { variant }), 'recruiter', 'impact')).toMatchObject({ status: 'at_risk', action: { kind: 'quantify' } })
    const gappy = screenUser({}, screenResume({ work: [tailorProfile().work[0]!, { ...tailorProfile().work[1]!, endDate: '2020-06' }] }))
    const p = path(gccJob(), { user: gappy })
    expect(check(p, 'recruiter', 'gaps')?.status).toBe('at_risk')
    expect(stage(p, 'recruiter').status).not.toBe('fail')
  })
})

describe('(d) hiring manager', () => {
  it('splits met must-haves into interview-ready and domain-only', () => {
    const job = gccJob({ descriptionMd: '## Requirements\n- PHP and Laravel.\n- ZATCA e-invoicing integration experience.' })
    const p = path(job)
    const m = stage(p, 'manager')
    expect(m.checks.some((c) => /interview-ready/.test(c.reason))).toBe(true)
    const zatca = m.checks.find((c) => /ZATCA/.test(c.reason))
    expect(zatca?.reason).toMatch(/domain-only|partly shown/)
  })

  it('missing must-haves are study items and lower the stage', () => {
    const m = stage(path({ ...TAILOR_JD }), 'manager')
    expect(m.status).not.toBe('pass')
    expect(m.checks.filter((c) => c.status === 'fail').every((c) => c.action?.kind === 'study')).toBe(true)
    expect(m.summary).toMatch(/must-haves interview-ready/)
  })
})

describe('(e) odds: shown, never a gate', () => {
  it('posting age, referral and channel', () => {
    const p = path(gccJob({ applyUrl: 'https://www.linkedin.com/jobs/view/1' }), {
      postedAt: new Date('2026-09-01T00:00:00Z'),
      referral: { count: 2, people: [{ name: 'Ameen' }] },
    })
    expect(check(p, 'odds', 'age')).toMatchObject({ status: 'at_risk', short: 'stale posting' })
    expect(check(p, 'odds', 'referral')).toMatchObject({ status: 'pass', action: { kind: 'referral', label: 'Ask Ameen for a referral' } })
    expect(check(p, 'odds', 'channel')).toMatchObject({ status: 'at_risk', action: { kind: 'apply_direct' } })
  })

  it('odds never decide the chip', () => {
    const p = path(gccJob({ descriptionMd: `${gccJob().descriptionMd}\n- MySQL in production.` }), {
      postedAt: new Date('2026-07-01T00:00:00Z'),
      variant: { name: 'full', evidence: { skills: new Set(), evidence: ['Skills: PHP, Laravel, MySQL, Redis, webhooks', 'Cut 40% of latency.', 'Ran 2M events/day.', 'Saved 3 days a month.'] } },
    })
    expect(stage(p, 'odds').status).toBe('at_risk')
    expect(p.stages.filter((s) => s.stage !== 'odds').every((s) => s.status === 'pass')).toBe(true)
    expect(chipText(p)).toBeNull()
  })
})

describe('the path', () => {
  it('"Next" starts with the CV to use and honest keywords, then the referral; never a missing term as a keyword', () => {
    const p = path(gccJob(), { referral: { count: 1, people: [{ name: 'Ameen' }] } })
    expect(p.next.map((a) => a.kind).slice(0, 3)).toEqual(['use_variant', 'add_keyword', 'referral'])
    expect(p.next[0]?.label).toBe(`Use “${VARIANT_NAME}”`)
    const tailor = path({ ...TAILOR_JD })
    expect(tailor.next.filter((a) => a.kind === 'add_keyword').every((a) => !/PostgreSQL|Kubernetes|Kafka/.test(a.label))).toBe(true)
  })

  it('compact form keeps each stage but only its concerns', () => {
    const full = path({ ...TAILOR_JD })
    const compact = compactPath(full)
    expect(compact.stages.map((s) => s.stage)).toEqual(full.stages.map((s) => s.stage))
    expect(compact.stages.flatMap((s) => s.checks).every((c) => c.status !== 'pass')).toBe(true)
    expect(compact.stages.every((s) => s.checks.length <= 4)).toBe(true)
    expect(chipText(compact)).toEqual(chipText(full))
  })

  it('is deterministic and never touches the Match detail', () => {
    const input = screenInput(gccJob())
    const before = JSON.stringify(input.detail)
    expect(JSON.stringify(screeningPath(input))).toBe(JSON.stringify(screeningPath(input)))
    expect(JSON.stringify(input.detail)).toBe(before)
  })
})
