import { describe, it, expect, vi } from 'vitest'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { extractOpenings, groundedUrl, guessFromLine } from '@/lib/discovery/manual-import/extract'
import { unavailableAi } from '@/lib/discovery/manual-import/no-ai'

const LEVER = 'https://jobs.lever.co/exampleco/1b2c3d4e-0000-4000-8000-000000000001'
const GH = 'https://boards.greenhouse.io/exampleco/jobs/4567890'

// Synthetic AI Mode-style answer.
const ANSWER = [
  'Here are some current openings:',
  `1. Backend Engineer at Example Co (Dubai) ${LEVER}`,
  `2. Data Analyst — Sample Bank — Riyadh — ${GH}`,
  '3. Systems Analyst at Demo Telecom (Doha). Link: https://www.linkedin.com/jobs/view/1234567890',
].join('\n')

describe('extractOpenings with an AI provider', () => {
  it('keeps model links only when they appear in the pasted text', async () => {
    const ai = new FixtureAIProvider({
      extractOpenings: () => ({
        openings: [
          { title: 'Backend Engineer', employer: 'Example Co', location: 'Dubai', posted_date: '', url: `${LEVER}?utm_source=ai`, snippet: '' },
          { title: 'Invented Role', employer: 'Nowhere Ltd', location: '', posted_date: '', url: 'https://careers.invented.example/jobs/9', snippet: '' },
        ],
      }),
    })
    const r = await extractOpenings(ANSWER, ai)
    expect(r.mode).toBe('ai')
    const byTitle = new Map(r.candidates.map((c) => [c.title, c]))
    expect(byTitle.get('Backend Engineer')?.url).toBe(LEVER)
    expect(byTitle.get('Backend Engineer')?.ats).toBe('lever')
    // Hallucinated link dropped; the row stays but cannot be imported.
    expect(byTitle.get('Invented Role')?.url).toBe('')
    // Links the model skipped come back as link-only rows.
    const urls = r.candidates.map((c) => c.url)
    expect(urls).toContain(GH)
    expect(urls).toContain('https://linkedin.com/jobs/view/1234567890')
    expect(r.candidates.find((c) => c.url.includes('linkedin'))?.board).toBe('LinkedIn')
  })

  it('reads titles with the default fixture (the E2E path)', async () => {
    const r = await extractOpenings(ANSWER, new FixtureAIProvider())
    expect(r.candidates.slice(0, 3).map((c) => [c.title, c.employer])).toEqual([
      ['Backend Engineer', 'Example Co'],
      ['Data Analyst', 'Sample Bank'],
      ['Systems Analyst', 'Demo Telecom'],
    ])
  })

  it('drops openings the text marks as nationals only', async () => {
    const ai = new FixtureAIProvider({
      extractOpenings: () => ({
        openings: [
          { title: 'IT Officer', employer: 'Gov Example', location: '', posted_date: '', url: GH, snippet: 'UAE nationals only (Emiratisation).' },
        ],
      }),
    })
    const r = await extractOpenings(`IT Officer, UAE nationals only ${GH}`, ai)
    expect(r.candidates).toEqual([])
    expect(r.note).toMatch(/nationals-only/)
  })

  it('drops an opening whose line in the pasted text says nationals only', async () => {
    const r = await extractOpenings(`Clerk at Gov Example — UAE nationals only — ${GH}\nAnalyst at Open Co ${LEVER}`, new FixtureAIProvider())
    expect(r.candidates.map((c) => c.url)).toEqual([LEVER])
  })

  it('falls back to links when the AI call fails', async () => {
    const r = await extractOpenings(ANSWER, unavailableAi('down'))
    expect(r.mode).toBe('urls')
    expect(r.candidates).toHaveLength(3)
    expect(r.note).toMatch(/only its links/)
  })
})

describe('extractOpenings without an AI key', () => {
  it('lists every link with a title guessed from its line', async () => {
    const r = await extractOpenings(ANSWER, null)
    expect(r.mode).toBe('urls')
    expect(r.note).toMatch(/No AI key/)
    expect(r.candidates.map((c) => [c.title, c.employer, c.url])).toEqual([
      ['Backend Engineer', 'Example Co', LEVER],
      ['Data Analyst', 'Sample Bank', GH],
      ['Systems Analyst', 'Demo Telecom', 'https://linkedin.com/jobs/view/1234567890'],
    ])
  })

  it('never calls a provider it was not given', async () => {
    const spy = vi.fn()
    await extractOpenings('just https://careers.example.org/jobs/1', null)
    expect(spy).not.toHaveBeenCalled()
  })

  it('skips links on a nationals-only line', async () => {
    const r = await extractOpenings(`Clerk at Gov Example — Saudization role — ${GH}\nhttps://careers.example.org/jobs/1`, null)
    expect(r.candidates.map((c) => c.url)).toEqual(['https://careers.example.org/jobs/1'])
  })
})

describe('helpers', () => {
  it('guessFromLine reads "title at employer (place)" and dash-separated lines', () => {
    expect(guessFromLine('* **Backend Engineer** at Example Co (Dubai) https://x.example')).toEqual({
      title: 'Backend Engineer',
      employer: 'Example Co',
      location: 'Dubai',
    })
    expect(guessFromLine('Data Analyst | Sample Bank | Riyadh')).toEqual({ title: 'Data Analyst', employer: 'Sample Bank', location: 'Riyadh' })
  })

  it('groundedUrl accepts only allowed canonical links', () => {
    const allowed = new Set([GH])
    expect(groundedUrl(`${GH}/`, allowed)).toBe(GH)
    expect(groundedUrl('https://boards.greenhouse.io/exampleco/jobs/1', allowed)).toBe('')
    expect(groundedUrl('not a url', allowed)).toBe('')
  })
})
