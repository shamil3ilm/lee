import { describe, expect, it } from 'vitest'
import { suggestRoles, type SuggestionProfile } from '@/lib/discovery/relevance/suggest'
import { classifyRole, resolveRoleFamily, ROLE_FAMILY_IDS } from '@/lib/discovery/relevance/roles'
import { evaluateRelevance } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import type { MasterCV } from '@/lib/documents/types'

/** Generic, made-up data — no real person. */
function profile(over: Partial<SuggestionProfile> = {}): SuggestionProfile {
  return {
    headline: 'Software developer',
    summaryMd: null,
    careerNarrativeMd: null,
    skills: [],
    industries: [],
    roleTypes: [],
    yearsExperience: null,
    stackWeights: {},
    dismissedRoleSuggestions: [],
    ...over,
  }
}

function cv(bullets: string[], tech: string[] = []): MasterCV {
  return {
    basics: { name: 'Test Person', headline: 'Developer' },
    summary: '',
    experience: [{ company: 'Example Co', role: 'Developer', start: '2024-01', end: 'present', bullets, tech }],
    skills: { primary: [] },
  }
}

const ids = (r: ReturnType<typeof suggestRoles>): string[] => r.suggestions.map((s) => s.id)

describe('data / analysis role families', () => {
  it.each([
    ['Data Analyst', 'data_analyst'],
    ['BI Developer (Power BI)', 'data_analyst'],
    ['MIS Executive', 'data_analyst'],
    ['Reporting Analyst - Riyadh', 'data_analyst'],
    ['Business Analyst', 'business_analyst'],
    ['ERP Analyst', 'business_analyst'],
    ['Oracle Functional Consultant', 'business_analyst'],
    ['SAP Functional Analyst (FICO)', 'business_analyst'],
    ['Systems Analyst', 'business_analyst'],
    ['Analytics Engineer', 'analytics_eng'],
    ['Junior Data Engineer', 'data'],
    ['ETL Developer', 'data'],
    ['QA Automation Engineer', 'qa_automation'],
    ['Technical Support Engineer', 'support_eng'],
    ['Implementation Consultant', 'implementation'],
  ])('classifies "%s" as %s (engineering-side, never "not engineering")', (title, family) => {
    const r = classifyRole({ title })
    expect(r.families).toContain(family)
    expect(r.engineering).toBe(true)
  })

  it('still treats finance analysts as not engineering', () => {
    expect(classifyRole({ title: 'Financial Analyst' }).engineering).toBe(false)
    expect(classifyRole({ title: 'Credit Analyst' }).engineering).toBe(false)
  })

  it('makes the families selectable and resolvable from labels', () => {
    expect(ROLE_FAMILY_IDS).toEqual(expect.arrayContaining(['data_analyst', 'business_analyst', 'analytics_eng', 'data']))
    expect(resolveRoleFamily('Data Analyst / BI')).toBe('data_analyst')
  })

  it('passes the gate when targeted, filters by role (not "not engineering") when not', () => {
    const prefs: SearchPrefs = { ...EMPTY_PREFS, active: true, roleFamilies: ['backend', 'data_analyst'] }
    expect(evaluateRelevance({ title: 'Data Analyst' }, prefs).pass).toBe(true)
    expect(evaluateRelevance({ title: 'Business Analyst' }, prefs).reasons).toEqual(['role: Business / Systems Analyst'])
  })

  it('keeps the sales-heavy hard rule for solutions roles', () => {
    const prefs: SearchPrefs = { ...EMPTY_PREFS, active: true, roleFamilies: ['implementation'] }
    const r = evaluateRelevance({ title: 'Implementation Consultant', descriptionMd: 'Quota-carrying role with commission and cold calling.' }, prefs)
    expect(r.pass).toBe(false)
    expect(r.reasons[0]).toMatch(/^sales-heavy/)
  })
})

describe('analyst suggestions (ready evidence only)', () => {
  it('suggests Data Analyst from SQL plus reporting / reconciliation in the master CV, with the reason', () => {
    const r = suggestRoles({
      profile: profile(),
      masterCv: cv(['Built statement exports and reconciliation reports for the ledger'], ['MySQL', 'Python']),
    })
    const s = r.suggestions.find((x) => x.id === 'data_analyst')
    expect(s?.family).toBe('data_analyst')
    expect(s?.reasons.join(' ')).toMatch(/master CV shows .*MySQL/)
    expect(s?.reasons).toContain('From interview-ready or domain-ready items in your master profile')
  })

  it('suggests Business / Systems Analyst from requirements work plus the ERP / e-invoicing domain', () => {
    const r = suggestRoles({
      profile: profile(),
      masterCv: cv(['Led requirements gathering with clients for the ZATCA e-invoicing business module']),
    })
    expect(ids(r)).toContain('business_analyst')
  })

  it('never suggests them from profile free text alone (not ready evidence)', () => {
    const r = suggestRoles({
      profile: profile({ skills: ['SQL', 'Power BI', 'Requirements gathering', 'ERP'], summaryMd: 'Reporting and reconciliation' }),
      masterCv: null,
    })
    expect(ids(r)).not.toContain('data_analyst')
    expect(ids(r)).not.toContain('business_analyst')
  })
})
