import { describe, it, expect } from 'vitest'
import { renderCvPdf, renderCoverLetterPdf } from '@/lib/pdf/render'
import type { MasterCV, CoverLetter } from '@/lib/documents/types'

const cv: MasterCV = {
  basics: {
    name: 'Ada Lovelace',
    headline: 'Backend Engineer',
    email: 'ada@example.com',
    phone: '+1-555-0100',
    location: 'London',
    linkedin: 'https://linkedin.com/in/ada',
  },
  summary: 'Ships things.',
  experience: [
    {
      company: 'Analytical Engine Ltd',
      role: 'Principal Engineer',
      start: '2020-01',
      end: 'present',
      bullets: ['Wrote the first algorithm', 'Made calculating machines useful'],
      tech: ['punchcards', 'gears'],
    },
  ],
  projects: [
    {
      name: 'Note G',
      description: 'The first computer program.',
      tech: ['analytical engine'],
    },
  ],
  education: [{ school: 'Home schooled', degree: 'Mathematics' }],
  skills: { primary: ['analysis', 'poetry', 'gears'], secondary: ['calculus'] },
  certifications: [{ name: 'Fellow', issuer: 'Royal Society' }],
  languages: [{ name: 'English', proficiency: 'Native' }],
}

const letter: CoverLetter = {
  applicationId: 'app-1',
  greeting: 'Dear Hiring Manager,',
  paragraphs: [
    'I am writing to apply for the Principal Engineer role.',
    'My background includes numerous accomplishments.',
    'Thank you for your time.',
  ],
  closing: 'Sincerely,\nAda',
  senderName: 'Ada Lovelace',
}

describe('PDF renderer', () => {
  it('renderCvPdf returns a real PDF buffer', async () => {
    const buf = await renderCvPdf(cv)
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.byteLength).toBeGreaterThan(1000)
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  }, 20_000)

  it('renderCoverLetterPdf returns a real PDF buffer', async () => {
    const buf = await renderCoverLetterPdf(letter, {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.byteLength).toBeGreaterThan(500)
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  }, 20_000)
})
