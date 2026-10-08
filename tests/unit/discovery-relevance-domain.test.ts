import { describe, expect, it } from 'vitest'
import { evaluateRelevance, type GateInput } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { REGION_CODES } from '@/lib/discovery/relevance/places'
import { domainOutcome, UNCERTAIN_FIT } from '@/lib/discovery/relevance/domain-rule'
import { learnTitle, learnedFor, normalizeTitle, parseLearnedTitles } from '@/lib/discovery/relevance/learned'

/** Unsaved preferences, provisional targets from a synthetic ready profile. */
const UNSAVED: SearchPrefs = {
  ...EMPTY_PREFS,
  readySkills: ['laravel', 'mysql', 'php', 'rest', 'sql', 'git'],
  provisionalFamilies: ['backend', 'fullstack'],
}
const SAVED: SearchPrefs = { ...UNSAVED, active: true, roleFamilies: ['backend', 'data_analyst'], regions: [...REGION_CODES] }

const job = (title: string, descriptionMd = '', extra: Partial<GateInput> = {}): GateInput => ({
  title,
  location: 'Dubai',
  remoteType: 'onsite',
  descriptionMd,
  techStack: [],
  ...extra,
})

describe('domain rule (before and after preferences are saved)', () => {
  it.each([
    ['Marketing Manager', 'Plan marketing campaigns and brand awareness.', 'domain: Marketing'],
    ['HR Generalist', 'End-to-end recruitment and employee relations.', 'domain: HR'],
    ['Legal Counsel', 'Litigation and drafting contracts.', 'domain: Legal'],
    ['Sales Executive', 'Meet sales targets through cold calling.', 'domain: Sales'],
    ['Accountant', 'Journal entries and month-end closing under IFRS.', 'domain: Accounting/Audit (non-tech)'],
    ['Receptionist', 'Front desk and answering phones.', 'domain: Admin/Operations'],
    ['Staff Nurse', 'Patient care in the ward. DHA license.', 'domain: Healthcare/Clinical'],
    ['Math Teacher', 'Lesson planning and classroom management.', 'domain: Teaching'],
    ['Chef de Partie', 'Food and beverage menu preparation.', 'domain: Hospitality'],
  ])('filters %s with the reason', (title, jd, reason) => {
    expect(evaluateRelevance(job(title, jd), UNSAVED).reasons).toEqual([reason])
    expect(evaluateRelevance(job(title, jd), SAVED).reasons[0]).toBe(reason)
  })

  it.each([
    ['Marketing Technology Engineer', 'Build integrations between our CRM and the data warehouse in Python.'],
    ['HRIS Developer', 'Develop SAP SuccessFactors integrations and REST APIs.'],
    ['Fintech Backend Engineer', 'Payment gateways, PHP and Laravel.'],
    ['Payments Engineer', 'Card issuing and reconciliation services.'],
    ['Data Analyst', 'SQL, Power BI dashboards and Excel.'],
  ])('keeps tech roles inside those fields: %s', (title, jd) => {
    expect(evaluateRelevance(job(title, jd), UNSAVED).pass).toBe(true)
  })

  it('never confuses fintech engineering with finance roles', () => {
    expect(evaluateRelevance(job('Finance Manager', 'Budgeting, financial statements and audit fieldwork.'), UNSAVED).reasons).toEqual([
      'domain: Accounting/Audit (non-tech)',
    ])
    expect(evaluateRelevance(job('Backend Engineer, Treasury Payments', 'Laravel services for payouts.'), UNSAVED).pass).toBe(true)
  })

  it('passes an unknown title whose JD shows the user\'s skills, labelled with the inferred family and "new title"', () => {
    const jd = '## Responsibilities\n- Build Laravel APIs and webhooks\n## Requirements\n- PHP, Laravel, MySQL\n- REST APIs and Git'
    for (const title of ['Payments Operations Technologist', 'Digital Solutions Specialist', 'Integration Analyst']) {
      const r = evaluateRelevance(job(title, jd), UNSAVED)
      expect(r.pass, title).toBe(true)
      expect(r.infos, title).toContain('Backend · new title')
    }
  })

  it('filters an unknown title only on positive evidence of an unrelated field and little skill overlap', () => {
    const recruiting = 'End-to-end recruitment, sourcing candidates and onboarding new hires.'
    expect(evaluateRelevance(job('Talent Navigator', recruiting), UNSAVED).reasons).toEqual(['domain: HR'])
    // The same duties plus the user's stack: mixed evidence, kept for review.
    const mixed = `${recruiting} Build our ATS in Laravel with MySQL and REST APIs.`
    const r = evaluateRelevance(job('Talent Navigator', mixed), UNSAVED)
    expect(r.pass).toBe(true)
    expect(r.penalties).toEqual([UNCERTAIN_FIT])
  })

  it('keeps an unknown title with no evidence either way as "Uncertain fit — review", ranked lower', () => {
    const r = evaluateRelevance(job('Future Shapers Fellow', 'Join a fast-growing team.'), UNSAVED)
    expect(r.pass).toBe(true)
    expect(r.penalties).toEqual([UNCERTAIN_FIT])
    expect(r.rankAdjust).toBeLessThan(0)
  })

  it('is switchable like the other rules', () => {
    const soft: SearchPrefs = { ...UNSAVED, extra: { ...UNSAVED.extra, rules: { domain: 'soft' } } }
    const r = evaluateRelevance(job('Marketing Manager', 'Marketing campaigns.'), soft)
    expect(r).toMatchObject({ pass: true, penalties: ['domain: Marketing'] })
  })
})

describe('learned titles', () => {
  it('normalises seniority, places and noise', () => {
    expect(normalizeTitle('Senior Integration Analyst - Riyadh (Hybrid)')).toBe('integration analyst')
    expect(normalizeTitle('Integration Analyst II')).toBe('integration analyst')
  })

  it('a related title passes with its learned family; an unrelated one is filtered with that reason', () => {
    const learned = learnTitle(learnTitle({}, 'Brand Analyst', { related: true, family: 'data_analyst' }), 'Growth Hacker', { related: false, family: null })
    const prefs: SearchPrefs = { ...UNSAVED, learnedTitles: learned }
    const related = evaluateRelevance(job('Senior Brand Analyst', 'Brand awareness reporting.'), prefs)
    expect(related.pass).toBe(true)
    expect(related.infos).toContain('Data Analyst / BI · learned')
    expect(evaluateRelevance(job('Growth Hacker', 'PHP and Laravel.'), prefs).reasons).toEqual(['domain: not your field (you said so)'])
  })

  it('parses stored values leniently and never mutates', () => {
    const before = parseLearnedTitles({ 'a b': { related: true, family: 'backend', at: '2026-10-01' }, bad: { related: 'x' } })
    expect(Object.keys(before)).toEqual(['a b'])
    const after = learnTitle(before, 'C D', { related: false, family: null }, new Date('2026-10-08T00:00:00Z'))
    expect(Object.keys(before)).toEqual(['a b'])
    expect(learnedFor(after, 'c d')).toEqual({ related: false, family: null, at: '2026-10-08' })
  })

  it('learned titles reach the outcome directly', () => {
    const o = domainOutcome({
      title: 'Brand Analyst',
      description: '',
      techStack: [],
      engineering: false,
      titleFamilies: [],
      mode: 'hard',
      targets: ['backend'],
      readySkills: [],
      learned: { 'brand analyst': { related: true, family: 'backend', at: '' } },
    })
    expect(o).toMatchObject({ hard: null, info: 'Backend · learned', family: 'backend' })
  })
})
