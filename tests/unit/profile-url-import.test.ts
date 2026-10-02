import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyImport,
  detectTerms,
  extractPageSections,
  proposeImport,
  readLinkedProfile,
} from '@/lib/profile/url-import'
import { suggestRoles } from '@/lib/discovery/relevance/suggest'
import { readProfileLinks, suggestLinksForJob, type ProfileLink } from '@/lib/profile/links'

/** Synthetic résumé page; no real person. */
const html = readFileSync(join(__dirname, '../fixtures/profile/resume-page.html'), 'utf8')

describe('profile import from a public page', () => {
  const sections = extractPageSections(html)

  it('strips scripts, styles, nav and forms', () => {
    expect(sections.text).not.toContain('window.tracking')
    expect(sections.text).not.toContain('font-family')
    expect(sections.text).not.toContain('Blog')
    expect(sections.text).toContain('Alex Example Backend developer building payment and SaaS platforms.')
  })

  it('splits experience and projects by heading', () => {
    expect(sections.experience).toEqual([
      'Software Engineer, Example Payments (2024–present)',
      'Built payment approvals and ACH transfers with Positive Pay checks for business accounts.',
      'Designed idempotency keys and webhook retries for partner APIs, cutting duplicate payouts by 98%.',
      'Added audit trails and row-level security to a multi-tenant Laravel platform serving 1,200 merchants.',
    ])
    expect(sections.projects).toHaveLength(2)
    expect(sections.projects[0]).toMatch(/^Invoice compliance toolkit/)
  })

  it('collects measurable results', () => {
    expect(sections.metrics).toEqual([
      'Designed idempotency keys and webhook retries for partner APIs, cutting duplicate payouts by 98%.',
      'Added audit trails and row-level security to a multi-tenant Laravel platform serving 1,200 merchants.',
    ])
  })

  it('captures domain terms', () => {
    const terms = detectTerms(sections.text)
    for (const t of ['payment approvals', 'positive pay', 'idempotency', 'webhook retries', 'audit trails', 'row-level security', 'multi-tenant', 'llm observability', 'zatca', 'xades']) {
      expect(terms, t).toContain(t)
    }
  })

  it('proposes only what is new, section by section', () => {
    const p = proposeImport({
      url: 'https://alex.example/resume',
      profile: { skills: ['PHP', 'Laravel'], headline: 'Developer', summaryMd: null, linkedProfile: null },
      sections,
      parsed: { headline: 'Backend developer (payments)', summary_md: null, skills: ['PHP', 'Laravel', 'MySQL'], industries: [], role_types: [], stack_weights: {} },
    })
    expect(p.skills.add).toContain('MySQL')
    expect(p.skills.add).not.toContain('PHP')
    expect(p.skills.add.map((s) => s.toLowerCase())).not.toContain('laravel')
    expect(p.headline).toEqual({ from: 'Developer', to: 'Backend developer (payments)' })
    expect(p.summary).toBeNull()
    expect(p.experience.add).toHaveLength(4)
  })

  it('saves only the accepted sections', () => {
    const p = proposeImport({ url: 'https://alex.example/resume', profile: null, sections, parsed: null })
    const now = new Date('2026-10-02T00:00:00Z')
    const patch = applyImport({ skills: ['PHP'], linkedProfile: null }, p, new Set(['experience', 'metrics'] as const), now)
    expect(patch.skills).toBeUndefined()
    expect(patch.headline).toBeUndefined()
    const linked = readLinkedProfile(patch.linkedProfile)!
    expect(linked.experience).toHaveLength(4)
    expect(linked.projects).toEqual([])
    expect(linked.metrics).toHaveLength(2)
    expect(linked.fetchedAt).toBe(now.toISOString())
    expect(applyImport(null, p, new Set())).toEqual({})
  })

  it('feeds role suggestions like the CV', () => {
    const p = proposeImport({ url: 'https://alex.example/resume', profile: null, sections, parsed: null })
    const patch = applyImport(null, p, new Set(['experience', 'projects', 'metrics'] as const))
    const base = { headline: null, summaryMd: null, careerNarrativeMd: null, skills: ['PHP'], industries: [], roleTypes: [], yearsExperience: null, stackWeights: {}, dismissedRoleSuggestions: [] }
    const without = suggestRoles({ profile: base, masterCv: null }).suggestions.map((s) => s.id)
    const withPage = suggestRoles({ profile: { ...base, linkedProfile: patch.linkedProfile }, masterCv: null }).suggestions.map((s) => s.id)
    expect(without).not.toContain('payments')
    expect(withPage).toEqual(expect.arrayContaining(['payments', 'platform_backend', 'einvoicing']))
  })
})

describe('profile links', () => {
  const links: ProfileLink[] = [
    { id: 'gh', label: 'GitHub', url: 'https://github.com/example', kind: 'github' },
    { id: 'li', label: 'LinkedIn', url: 'https://www.linkedin.com/in/example', kind: 'linkedin' },
    { id: 'cs1', label: 'Case study: ACH payment approvals at scale', url: 'https://alex.example/ach', kind: 'case_study' },
    { id: 'cs2', label: 'Case study: design system', url: 'https://alex.example/ds', kind: 'case_study' },
  ]

  it('drops invalid stored links', () => {
    expect(readProfileLinks([...links, { id: 'x', label: 'Bad', url: 'javascript:alert(1)', kind: 'other' }, 'junk'])).toEqual(links)
  })

  it('suggests the payments case study for a payments role, with the reason', () => {
    const s = suggestLinksForJob(links, { title: 'Payments Backend Engineer', description: 'ACH and payment approvals.' })
    expect(s[0]).toMatchObject({ link: { id: 'cs1' }, suggested: true })
    expect(s[0]!.reason).toMatch(/^Matches the job: /)
    expect(s.find((x) => x.link.id === 'gh')!.suggested).toBe(true)
    expect(s.find((x) => x.link.id === 'cs2')!.suggested).toBe(false)
    expect(s.find((x) => x.link.id === 'li')!.suggested).toBe(false)
  })

  it('suggests LinkedIn for outreach', () => {
    const s = suggestLinksForJob(links, { title: 'Backend Engineer' }, 'outreach')
    expect(s.find((x) => x.link.id === 'li')!.suggested).toBe(true)
  })
})
