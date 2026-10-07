import { describe, expect, it } from 'vitest'
import { applyChannel, buildChecklist, postingQuestions, requiredDocuments } from '@/lib/apply/checklist'

describe('apply checklist', () => {
  it('names the ATS from the apply link', () => {
    expect(applyChannel('https://boards.greenhouse.io/acme/jobs/1')?.label).toBe('Greenhouse')
    expect(applyChannel('https://jobs.lever.co/acme/1')?.label).toBe('Lever')
    expect(applyChannel('https://acme.example/careers/1')?.label).toBe('Company site')
    expect(applyChannel('javascript:alert(1)')).toBeNull()
    expect(applyChannel('not a url')).toBeNull()
  })

  it('always lists a CV and adds the documents the posting asks for', () => {
    const docs = requiredDocuments('Please send your CV with a cover letter, a link to your GitHub and your expected salary. Notice period?')
    expect(docs.map((d) => d.id)).toEqual(['doc:cv', 'doc:cover_letter', 'doc:github', 'doc:salary', 'doc:notice'])
  })

  it('collects the questions the posting asks, skipping marketing lines', () => {
    const q = postingQuestions(
      [
        '## About you',
        'Are you ready for a challenge?',
        '- How many years have you worked with Laravel?',
        'Tell us more. What is your notice period?',
        'What is your notice period?',
      ].join('\n'),
    )
    expect(q.map((x) => x.label)).toEqual(['How many years have you worked with Laravel?', 'What is your notice period?'])
  })

  it('builds the full checklist with a fallback when there is no link', () => {
    const c = buildChecklist({ applyUrl: null, description: null })
    expect(c.where.href).toBeUndefined()
    expect(c.documents).toHaveLength(1)
    expect(c.questions).toEqual([])
  })
})
