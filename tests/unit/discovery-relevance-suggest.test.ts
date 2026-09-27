import { describe, expect, it } from 'vitest'
import { profileDigest, suggestRoles, type SuggestionProfile } from '@/lib/discovery/relevance/suggest'
import type { MasterCV } from '@/lib/documents/types'

/** Generic, made-up profile data — no real person. */
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

function cv(over: Partial<MasterCV> = {}): MasterCV {
  return {
    basics: { name: 'Test Person', headline: 'Developer' },
    summary: '',
    experience: [],
    skills: { primary: [] },
    ...over,
  }
}

const ids = (r: ReturnType<typeof suggestRoles>): string[] => r.suggestions.map((s) => s.id)

describe('suggestRoles', () => {
  it('maps PHP/Laravel + React to backend and full-stack flavours, with reasons citing the profile', () => {
    const r = suggestRoles({ profile: profile({ skills: ['PHP', 'Laravel', 'MySQL', 'React'], yearsExperience: 2 }), masterCv: null })
    expect(ids(r)).toEqual(expect.arrayContaining(['backend_php', 'fullstack_laravel']))
    const backend = r.suggestions.find((s) => s.id === 'backend_php')!
    expect(backend).toMatchObject({ family: 'backend', label: 'Backend (PHP/Laravel)', priority: 'strong', source: 'rules' })
    expect(backend.reasons[0]).toMatch(/^Your profile lists PHP, Laravel/)
    expect(backend.reasons).toContain('2 yrs experience in your profile')
  })

  it('suggests payments and integration roles from the master CV and industries', () => {
    const r = suggestRoles({
      profile: profile({ skills: ['PHP', 'Laravel'], industries: ['Fintech'] }),
      masterCv: cv({
        experience: [
          {
            company: 'Example Co',
            role: 'Software Engineer',
            start: '2024-01',
            end: 'present',
            bullets: ['Built payment gateway integrations and ACH reconciliation', 'Designed webhooks for partner APIs'],
            tech: ['Laravel', 'MySQL'],
          },
        ],
      }),
    })
    expect(ids(r)).toEqual(expect.arrayContaining(['payments', 'payments_integration', 'api_integration']))
    const pay = r.suggestions.find((s) => s.id === 'payments')!
    expect(pay.reasons.join(' | ')).toMatch(/master CV shows/)
    expect(pay.reasons).toContain('Industry: fintech')
  })

  it('suggests e-invoicing and ERP roles from tax-compliance evidence', () => {
    const r = suggestRoles({ profile: profile({ skills: ['PHP', 'ZATCA', 'XAdES', 'VAT'] }), masterCv: null })
    expect(ids(r)).toEqual(expect.arrayContaining(['einvoicing', 'erp']))
  })

  it('suggests an LLM-integration stretch and a TypeScript full-stack flavour', () => {
    const r = suggestRoles({ profile: profile({ skills: ['Next.js', 'TypeScript', 'Supabase', 'OpenRouter'] }), masterCv: null })
    const llm = r.suggestions.find((s) => s.id === 'llm_app')!
    expect(llm.priority).toBe('stretch')
    expect(ids(r)).toContain('fullstack_ts')
  })

  it('never suggests DevOps without container/orchestration/cloud evidence', () => {
    const noInfra = suggestRoles({ profile: profile({ skills: ['PHP', 'Laravel', 'Linux', 'Jenkins', 'CI/CD'] }), masterCv: null })
    expect(ids(noInfra)).not.toContain('devops')
    const infra = suggestRoles({ profile: profile({ skills: ['PHP', 'Docker', 'Kubernetes', 'AWS'] }), masterCv: null })
    expect(ids(infra)).toContain('devops')
  })

  it('offers production support as a low-priority fallback', () => {
    const r = suggestRoles({ profile: profile({ skills: ['PHP', 'Laravel', 'Troubleshooting', 'Production support'] }), masterCv: null })
    expect(r.suggestions.at(-1)).toMatchObject({ id: 'support_eng', priority: 'fallback' })
  })

  it('skips families already targeted and suggestions the user dismissed', () => {
    const r = suggestRoles({
      profile: profile({ skills: ['PHP', 'Laravel', 'React'], roleTypes: ['Backend Engineer'], dismissedRoleSuggestions: ['fullstack_laravel'] }),
      masterCv: null,
    })
    expect(ids(r)).not.toContain('backend_php')
    expect(ids(r)).not.toContain('fullstack_laravel')
  })

  it('ignores ambiguous words in prose ("go live", "the API team")', () => {
    const r = suggestRoles({
      profile: profile(),
      masterCv: cv({ experience: [{ company: 'X', role: 'Coordinator', start: '2023-01', end: '2024-01', bullets: ['Helped the product go live', 'Worked with the API team'] }] }),
    })
    expect(ids(r)).toEqual([])
  })

  it('flags a sparse profile', () => {
    expect(suggestRoles({ profile: null, masterCv: null })).toMatchObject({ sparse: true, hasProfile: false, hasMasterCv: false })
    expect(suggestRoles({ profile: profile({ skills: ['PHP', 'Laravel', 'MySQL'] }), masterCv: null }).sparse).toBe(false)
  })

  it('builds a digest without contact details', () => {
    const d = profileDigest({ profile: profile({ skills: ['PHP'] }), masterCv: cv({ basics: { name: 'Test Person', headline: 'Dev', email: 'a@b.c', phone: '123' } }) })
    expect(d).toContain('Profile skills: PHP')
    expect(d).not.toContain('a@b.c')
    expect(d).not.toContain('Test Person')
  })
})
