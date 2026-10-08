import { describe, expect, it } from 'vitest'
import { addStudySkill, recurringGaps, STUDY_GROUP } from '@/lib/cv-fit/study'
import { backedSkillIds } from '@/lib/resume/readiness'
import { studyList } from '@/lib/resume/study'
import { parseResumeProfile } from '@/lib/resume/types'
import { renderVariant } from '@/lib/variants/render'
import { tailorProfile, tailorRecipe } from '@/tests/fixtures/resume/tailor'

describe('addStudySkill', () => {
  it('adds a learning skill to the Study list group, never shown on a CV', () => {
    const r = addStudySkill(tailorProfile(), 'Terraform', 'From: Platform Engineer at Acme', () => 'sk-tf')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.created).toBe(true)
    const profile = parseResumeProfile(r.profile)
    const group = profile.skills.find((g) => g.name === STUDY_GROUP)!
    expect(group.skills[0]).toMatchObject({ id: 'sk-tf', name: 'Terraform', depth: 'learning', interviewReady: false, domainReady: false })
    expect(studyList(profile).map((s) => s.label)).toContain('Terraform')
    expect(backedSkillIds(profile).has('sk-tf')).toBe(false)
    const rendered = renderVariant(profile, tailorRecipe({ skills: ['sk-tf', 'sk-php'] }))
    expect(rendered.sections.find((s) => s.key === 'skills')!.lines[0]).toBe('PHP')
  })

  it('reuses an existing study item and refuses a ready skill', () => {
    const again = addStudySkill(tailorProfile(), 'kubernetes', '')
    expect(again).toMatchObject({ ok: true, created: false, skillId: 'sk-k8s' })
    expect(addStudySkill(tailorProfile(), 'Laravel', '')).toMatchObject({ ok: false })
    expect(addStudySkill(tailorProfile(), '   ', '')).toMatchObject({ ok: false })
  })
})

describe('recurringGaps', () => {
  it('counts missing must-haves across postings, once per posting', () => {
    const gaps = recurringGaps([
      ['Kubernetes (required)', 'Kafka (required)'],
      ['Kubernetes (required)', 'Kubernetes (required)'],
      ['kafka (required)', 'Arabic fluency (required)'],
      ['Terraform (required)'],
    ])
    expect(gaps).toEqual([
      { label: 'Kafka', count: 2 },
      { label: 'Kubernetes', count: 2 },
    ])
  })
})
