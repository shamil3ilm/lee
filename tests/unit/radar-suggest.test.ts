import { describe, expect, it } from 'vitest'
import { readyCvSkills, suggestWatches } from '@/lib/radar/suggest'
import { validateResumeProfile } from '@/lib/resume/service'

describe('suggested watches', () => {
  it('merges CV and Playground names, skipping watched terms and duplicates', () => {
    const s = suggestWatches({
      cvSkills: ['Vector Search', 'zorb', 'Vector  search'],
      academySkills: ['Caching', 'vector search'],
      existing: ['Zorb'],
    })
    expect(s).toEqual([
      { term: 'Vector Search', reason: 'cv' },
      { term: 'Caching', reason: 'playground' },
    ])
  })

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Skill ${i}`)
    expect(suggestWatches({ cvSkills: many, academySkills: [], existing: [] })).toHaveLength(12)
  })

  it('uses only CV skills backed by ready evidence', () => {
    const profile = validateResumeProfile({
      skills: [
        {
          id: 'g1',
          name: 'Tech',
          skills: [
            { id: 's1', name: 'Ready Skill', interviewReady: true, depth: 'own' },
            { id: 's2', name: 'Learning Skill', interviewReady: false, depth: 'learning' },
          ],
        },
      ],
    })
    expect(readyCvSkills(profile)).toEqual(['Ready Skill'])
  })
})
