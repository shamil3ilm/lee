import { describe, expect, it } from 'vitest'
import { inferLinkKind } from '@/lib/profile/links'
import { clearSections, clearStudyNotes, overlayCounts, removeWordings, resetLinkKinds, resetReadiness, sectionCount, studyNoteLabels } from '@/lib/reset/profile'
import { CONFIRM_WORD, isEmptySelection, needsTypedConfirm, PROFILE_SECTIONS, RESET_TARGETS } from '@/lib/reset/types'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'

describe('reset: master profile sections', () => {
  it('counts per section', () => {
    const p = syntheticProfile()
    expect(sectionCount(p, 'work')).toBe(p.work.length)
    expect(sectionCount(p, 'skills')).toBe(p.skills.reduce((n, g) => n + g.skills.length, 0))
    expect(sectionCount(p, 'basics')).toBeGreaterThan(0)
  })

  it('clears only the chosen sections and drops case studies left dangling', () => {
    const p = syntheticProfile()
    const next = clearSections(p, ['work', 'skills'])
    expect(next.work).toEqual([])
    expect(next.skills).toEqual([])
    expect(next.projects).toEqual(p.projects)
    expect(next.basics).toEqual(p.basics)
    expect(next.portfolio.caseStudies).toEqual([])
    expect(clearSections(p, ['basics']).basics.name).toBe('')
  })
})

describe('reset: overlay and study notes', () => {
  it('the overlay removes wordings only; readiness resets only on its own; facts unchanged', () => {
    const p = syntheticProfile()
    expect(overlayCounts(p, []).readiness).toBeGreaterThan(0)
    const noWordings = removeWordings(p)
    expect(overlayCounts(noWordings, []).wordings).toBe(0)
    expect(overlayCounts(noWordings, []).readiness).toBe(overlayCounts(p, []).readiness)
    const next = resetReadiness(noWordings)
    expect(overlayCounts(next, []).readiness).toBe(0)
    expect(next.work.map((w) => w.highlights.map((h) => h.text))).toEqual(p.work.map((w) => w.highlights.map((h) => h.text)))
    expect(next.skills.flatMap((g) => g.skills).every((s) => s.depth === 'learning' && !s.interviewReady && !s.domainReady)).toBe(true)
  })

  it('link kinds go back to what the address says', () => {
    const links = [
      { id: 'a', label: 'Code', url: 'https://github.com/example', kind: 'case_study' as const },
      { id: 'b', label: 'Me', url: 'https://www.linkedin.com/in/example', kind: 'linkedin' as const },
    ]
    expect(overlayCounts(syntheticProfile(), links).linkKinds).toBe(1)
    expect(resetLinkKinds(links).map((l) => l.kind)).toEqual(['github', 'linkedin'])
    expect(inferLinkKind('not a url')).toBe('other')
  })

  it('study notes are cleared; the items and their readiness stay', () => {
    const p = syntheticProfile()
    const noted = { ...p, projects: p.projects.map((x, i) => (i === 0 ? { ...x, studyNotes: 'Read the RFC', studyTarget: '2026-11' } : x)) }
    expect(studyNoteLabels(noted)).toEqual([p.projects[0]!.name])
    const next = clearStudyNotes(noted)
    expect(studyNoteLabels(next)).toEqual([])
    expect(next.projects[0]!.interviewReady).toBe(noted.projects[0]!.interviewReady)
  })
})

describe('reset: confirm gating', () => {
  const none = { profile: [], targets: [], importBatchIds: [] }
  it('needs RESET typed for a full reset only', () => {
    expect(CONFIRM_WORD).toBe('RESET')
    expect(isEmptySelection(none)).toBe(true)
    expect(needsTypedConfirm({ ...none, profile: ['work'] })).toBe(false)
    expect(needsTypedConfirm({ ...none, targets: ['links', 'learnedTitles'] })).toBe(false)
    expect(needsTypedConfirm({ ...none, profile: [...PROFILE_SECTIONS] })).toBe(true)
    expect(needsTypedConfirm({ ...none, targets: ['overlay'] })).toBe(true)
    expect(needsTypedConfirm({ ...none, targets: ['readiness'] })).toBe(true)
    expect(needsTypedConfirm({ ...none, targets: [...RESET_TARGETS] })).toBe(true)
  })
})
