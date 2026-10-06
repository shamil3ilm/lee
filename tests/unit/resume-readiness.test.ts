import { describe, expect, it } from 'vitest'
import { checkDomainWording } from '@/lib/resume/fact-lock'
import {
  backedSkillIds,
  canOverride,
  presentation,
  resolveHighlight,
} from '@/lib/resume/readiness'
import { patchStudyItem, studyList } from '@/lib/resume/study'
import { projectSchema, skillSchema } from '@/lib/resume/types'
import { hl, syntheticProfile } from '@/tests/fixtures/resume/profile'

const BUILT = 'Built the ZATCA clearance integration for 3 merchants.'

describe('readiness defaults', () => {
  it('own items are ready; everything else waits for the user', () => {
    expect(hl('a', 'x')).toMatchObject({ depth: 'own', interviewReady: true, domainReady: true })
    expect(hl('b', 'x', { depth: 'ai_assisted' })).toMatchObject({ interviewReady: false, domainReady: false })
    expect(hl('c', 'x', { depth: 'learning' })).toMatchObject({ interviewReady: false, domainReady: false })
  })

  it('respects explicit flags and keeps ready ⇒ domain-ready', () => {
    expect(hl('a', 'x', { depth: 'ai_assisted', domainReady: true })).toMatchObject({ interviewReady: false, domainReady: true })
    expect(hl('b', 'x', { depth: 'ai_assisted', interviewReady: true, domainReady: false })).toMatchObject({
      interviewReady: true,
      domainReady: true,
    })
  })
})

describe('presentation', () => {
  it('maps readiness to full / override / domain / excluded', () => {
    expect(presentation(hl('a', 'x'))).toBe('full')
    const ai = hl('b', 'x', { depth: 'ai_assisted' })
    expect(presentation(ai)).toBe('excluded')
    expect(presentation(ai, true)).toBe('override')
    expect(presentation(hl('c', 'x', { depth: 'ai_assisted', domainReady: true }))).toBe('domain')
    const learning = hl('d', 'x', { depth: 'learning' })
    expect(canOverride(learning)).toBe(false)
    expect(presentation(learning, true)).toBe('excluded')
  })
})

describe('domain-only wording (fact lock + domain lock)', () => {
  const domainOnly = { depth: 'ai_assisted', domainReady: true }

  it('flags implementation claims and accepts design wording', () => {
    expect(checkDomainWording(BUILT)).toEqual({ ok: false, claims: ['built'] })
    expect(checkDomainWording('Designed the ZATCA clearance flow and wrote the code')).toEqual({ ok: false, claims: ['wrote'] })
    expect(checkDomainWording('Designed the ZATCA clearance flow for 3 merchants').ok).toBe(true)
  })

  it('leaves out a domain-only highlight whose only wording claims implementation', () => {
    expect(resolveHighlight(hl('h', BUILT, domainOnly), null)).toBeNull()
  })

  it('uses a design wording that keeps the facts', () => {
    const h = hl('h', BUILT, {
      ...domainOnly,
      alternates: [
        { id: 'w-impl', text: 'Implemented ZATCA clearance for 3 merchants' },
        { id: 'w-bad', text: 'Designed the ZATCA clearance flow for 5 merchants' },
        { id: 'w-ok', text: 'Designed the ZATCA clearance flow and domain model for 3 merchants' },
      ],
    })
    // Chosen wording claims implementation → fallback to the first valid design wording.
    expect(resolveHighlight(h, 'w-impl')).toEqual({
      text: 'Designed the ZATCA clearance flow and domain model for 3 merchants',
      wordingId: 'w-ok',
      mode: 'domain',
      stale: true,
    })
    // A design wording with an invented number is never used.
    expect(resolveHighlight(h, 'w-bad')?.wordingId).toBe('w-ok')
    expect(resolveHighlight(h, 'w-ok')).toMatchObject({ wordingId: 'w-ok', stale: false })
  })

  it('a fully ready item may use any fact-locked wording', () => {
    const h = hl('h', BUILT, { alternates: [{ id: 'w', text: 'Implemented ZATCA clearance for 3 merchants' }] })
    expect(resolveHighlight(h, 'w')).toMatchObject({ text: 'Implemented ZATCA clearance for 3 merchants', mode: 'full' })
  })

  it('an overridden ai_assisted item shows in full (the variant warns)', () => {
    expect(resolveHighlight(hl('h', BUILT, { depth: 'ai_assisted' }), null, true)).toMatchObject({ mode: 'override', text: BUILT })
  })
})

describe('skill backing', () => {
  it('tech skills need a ready item or the user marking them ready', () => {
    const base = syntheticProfile()
    const rust = skillSchema.parse({ id: 'sk-rust', name: 'Rust', depth: 'learning' })
    const kafka = skillSchema.parse({ id: 'sk-kafka', name: 'Kafka', depth: 'ai_assisted' })
    const elixir = skillSchema.parse({ id: 'sk-elixir', name: 'Elixir', depth: 'ai_assisted', interviewReady: true })
    const profile = {
      ...base,
      projects: [
        projectSchema.parse({ id: 'pr-vibe', name: 'Rust Gateway', keywords: ['Rust'], depth: 'ai_assisted', highlights: [{ id: 'h-r', text: 'A Rust API gateway.' }] }),
      ],
      skills: [...base.skills, { id: 's-new', name: 'New', level: '', visibility: {}, skills: [rust, kafka, elixir] }],
    }
    const backed = backedSkillIds(profile)
    expect(backed.has('sk-rust')).toBe(false) // only a not-ready project mentions it
    expect(backed.has('sk-kafka')).toBe(true) // PayFlow (ready) lists Kafka
    expect(backed.has('sk-elixir')).toBe(true) // marked ready on its own
  })

  it('domain skills can be backed by domain-only evidence, tech skills cannot', () => {
    const base = syntheticProfile()
    const zatca = skillSchema.parse({ id: 'sk-zatca', name: 'ZATCA', kind: 'domain', depth: 'ai_assisted' })
    const laravel = skillSchema.parse({ id: 'sk-laravel', name: 'Laravel', depth: 'ai_assisted' })
    const profile = {
      ...base,
      work: [],
      projects: [
        projectSchema.parse({
          id: 'pr-einv',
          name: 'E-invoicing hub',
          description: 'ZATCA e-invoicing hub on Laravel',
          keywords: ['Laravel'],
          depth: 'ai_assisted',
          domainReady: true,
          highlights: [{ id: 'h-e', text: 'Designed the ZATCA clearance workflow and Laravel queue topology.', depth: 'ai_assisted', domainReady: true }],
        }),
      ],
      skills: [{ id: 's-x', name: 'X', level: '', visibility: {}, skills: [zatca, laravel] }],
    }
    const backed = backedSkillIds(profile)
    expect(backed.has('sk-zatca')).toBe(true)
    expect(backed.has('sk-laravel')).toBe(false)
  })
})

describe('study list', () => {
  it('lists ai_assisted and learning items and marks one ready immutably', () => {
    const base = syntheticProfile()
    const profile = {
      ...base,
      projects: base.projects.map((p) => ({ ...p, depth: 'ai_assisted' as const, interviewReady: false, domainReady: false })),
    }
    const list = studyList(profile)
    expect(list.map((i) => [i.kind, i.id])).toEqual([['project', 'pr-ledger']])
    const next = patchStudyItem(profile, 'pr-ledger', { interviewReady: true, studyNotes: 'Walked through the invariants', studyTarget: '2026-10-30' })
    expect(next.projects[0]).toMatchObject({ interviewReady: true, domainReady: true, studyNotes: 'Walked through the invariants', studyTarget: '2026-10-30' })
    expect(profile.projects[0]!.interviewReady).toBe(false)
    expect(patchStudyItem(next, 'pr-ledger', { domainReady: false }).projects[0]).toMatchObject({ interviewReady: false, domainReady: false })
  })
})
