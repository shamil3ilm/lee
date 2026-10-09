import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectTerms, extractPageSections, readLinkedProfile } from '@/lib/profile/url-import'
import { buildUrlImportItems, proposalFrom, type UrlImportContext } from '@/lib/profile/url-import-review'
import { applyUrlSelection } from '@/lib/profile/url-import-apply'
import { emptyResumeProfile } from '@/lib/resume/types'
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

  it('finds GitHub and LinkedIn profile links, never mailto', () => {
    expect(sections.links).toEqual([
      { url: 'https://github.com/alex-example', kind: 'github' },
      { url: 'https://www.linkedin.com/in/alex-example', kind: 'linkedin' },
    ])
  })

  const parsed = { headline: 'Backend developer (payments)', summary_md: null, skills: ['PHP', 'Laravel', 'MySQL'], industries: [], role_types: [], stack_weights: {} }
  const ctx = (over: Partial<UrlImportContext> = {}): UrlImportContext => ({
    headline: 'Developer',
    summaryMd: null,
    skills: ['PHP', 'Laravel'],
    resume: emptyResumeProfile(),
    links: [{ id: 'gh', label: 'GitHub', url: 'https://github.com/someone-else', kind: 'github' }],
    linked: null,
    ...over,
  })

  it('lists every item with new / duplicate / update', () => {
    const p = proposalFrom('https://alex.example/resume', sections, parsed, detectTerms(sections.text))
    const items = buildUrlImportItems(p, ctx())
    const by = (label: string) => items.find((i) => i.label === label)
    expect(by('MySQL')).toMatchObject({ section: 'skills', status: 'new', hasReadiness: true, isPublic: true })
    expect(by('PHP')).toMatchObject({ status: 'duplicate', hasReadiness: false })
    expect(by('Headline')).toMatchObject({ status: 'update', diff: [{ mine: 'Developer', imported: 'Backend developer (payments)' }] })
    expect(by('GitHub')).toMatchObject({ section: 'links', status: 'update' })
    expect(by('LinkedIn')).toMatchObject({ section: 'links', status: 'new' })
    expect(items.filter((i) => i.section === 'projects')).toHaveLength(2)
    expect(items.filter((i) => i.section === 'evidence' && !i.isPublic)).toHaveLength(6)
  })

  const now = '2026-10-02T00:00:00.000Z'
  const prov = { source: 'url' as const, importedAt: now }

  it('editable: saves only the ticked items, learning unless mine, with provenance', () => {
    const p = proposalFrom('https://alex.example/resume', sections, parsed, detectTerms(sections.text))
    const items = buildUrlImportItems(p, ctx())
    const key = (pred: (l: string) => boolean) => items.find((i) => pred(i.label))!.key
    const mysql = key((l) => l === 'MySQL')
    const proj = key((l) => l.startsWith('Invoice compliance toolkit'))
    const exp = items.filter((i) => i.key.startsWith('evidence:experience:'))
    let n = 0
    const r = applyUrlSelection(ctx(), p, items, { picked: [mysql, proj, exp[1]!.key, exp[2]!.key, key((l) => l === 'GitHub')], mine: [proj, exp[1]!.key] }, prov, true, () => `id-${++n}`)
    expect(r.patch.headline).toBeUndefined()
    expect(r.patch.skills).toBeUndefined() // MySQL is learning: the flat list only gets "mine" skills
    const skills = r.resume!.skills.flatMap((g) => g.skills)
    expect(skills).toEqual([expect.objectContaining({ name: 'MySQL', depth: 'learning', interviewReady: false, source: 'url', importedAt: now })])
    expect(r.resume!.skills[0]!.name).toBe('From alex.example')
    expect(r.resume!.projects).toEqual([expect.objectContaining({ depth: 'own', interviewReady: true, source: 'url' })])
    expect(r.patch.links).toEqual([{ id: 'gh', label: 'GitHub', url: 'https://github.com/alex-example', kind: 'github' }])
    expect(r.changes.linksUpdated).toEqual([expect.objectContaining({ id: 'gh' })])
    const linked = readLinkedProfile(r.patch.linkedProfile)!
    expect(linked.experience).toEqual([exp[1]!.label])
    expect(linked.learning.experience).toEqual([exp[2]!.label])
    expect(linked.fetchedAt).toBe(now)
    expect(r.intentions).toEqual([])
  })

  it('not editable: public facts become intentions only; page evidence is still saved', () => {
    const p = proposalFrom('https://alex.example/resume', sections, parsed, detectTerms(sections.text))
    const items = buildUrlImportItems(p, ctx())
    const mysql = items.find((i) => i.label === 'MySQL')!.key
    const head = items.find((i) => i.label === 'Headline')!.key
    const exp = items.find((i) => i.key === 'evidence:experience:1')!.key
    const r = applyUrlSelection(ctx(), p, items, { picked: [mysql, head, exp], mine: [mysql] }, prov, false)
    expect(r.resume).toBeNull()
    expect(r.patch.headline).toBeUndefined()
    expect(r.patch.skills).toBeUndefined()
    expect(r.patch.links).toBeUndefined()
    expect(r.intentions).toEqual([{ section: 'skills', name: 'MySQL', mine: true }])
    expect(readLinkedProfile(r.patch.linkedProfile)!.learning.experience).toHaveLength(1)
  })

  it('feeds role suggestions only through lines marked mine', () => {
    const p = proposalFrom('https://alex.example/resume', sections, null, [])
    const items = buildUrlImportItems(p, ctx())
    const lines = items.filter((i) => i.section === 'evidence').map((i) => i.key)
    const base = { headline: null, summaryMd: null, careerNarrativeMd: null, skills: ['PHP'], industries: [], roleTypes: [], yearsExperience: null, stackWeights: {}, dismissedRoleSuggestions: [] }
    const learning = applyUrlSelection(ctx(), p, items, { picked: lines, mine: [] }, prov, false)
    const mine = applyUrlSelection(ctx(), p, items, { picked: lines, mine: lines }, prov, false)
    const ids = (linkedProfile: unknown) => suggestRoles({ profile: { ...base, linkedProfile }, masterCv: null }).suggestions.map((s) => s.id)
    expect(ids(learning.patch.linkedProfile)).not.toContain('payments')
    expect(ids(mine.patch.linkedProfile)).toContain('payments')
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
