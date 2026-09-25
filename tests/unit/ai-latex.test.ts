import { describe, it, expect, vi } from 'vitest'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { stripLatexFencing } from '@/lib/ai/utils/latex'
import type { MasterCV } from '@/lib/documents/types'

// Reuse the same @google/generative-ai and db mocks as ai-gemini-v2 — vitest
// with isolate:false shares mocks across files by module id, so we just
// dispatch on the prompt content here.
vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    getGenerativeModel() {
      return {
        generateContent: async (prompt: string) => {
          const text = pickResponseByPrompt(String(prompt))
          return {
            response: {
              text: () => text,
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
            },
          }
        },
      }
    }
  }
  return { GoogleGenerativeAI }
})

vi.mock('@/lib/db/client', () => ({ db: { insert: () => ({ values: async () => {} }) } }))
vi.mock('@/lib/db/schema', () => ({ aiCallLogs: {} }))

// Full dispatch table — vitest `isolate:false` means this factory may service
// requests from OTHER test files if we're the first-loaded mock. Return a
// valid shape for every known prompt so unrelated tests don't crash.
function pickResponseByPrompt(prompt: string): string {
  if (prompt.includes('You produce a COMPLETE, VALID LaTeX document')) {
    return JSON.stringify({
      source:
        '\\documentclass{article}\n\\begin{document}\nHello from LaTeX.\n\\end{document}\n',
    })
  }
  if (prompt.includes('You tailor a master CV JSON')) {
    return JSON.stringify({
      basics: { name: 'Ada', headline: 'Engineer' },
      summary: 'A rewritten summary.',
      experience: [
        {
          company: 'Acme',
          role: 'Eng',
          start: '2020-01',
          end: 'present',
          bullets: ['built things'],
        },
      ],
      skills: { primary: ['ts'] },
      _tailoring: {
        applicationId: 'app-1',
        reasoning: 'r',
        highlighted_skills: ['ts'],
        reordered_experience_indices: [0],
        summary_rewrite: true,
      },
    })
  }
  if (prompt.includes('You draft a role-specific cover letter')) {
    return JSON.stringify({
      applicationId: 'app-1',
      greeting: 'Dear Hiring Manager,',
      paragraphs: ['p1', 'p2', 'p3'],
      closing: 'Sincerely, Ada',
      senderName: 'Ada',
    })
  }
  if (prompt.includes('You distill a list of GitHub public repos')) {
    return JSON.stringify([
      {
        name: 'repo',
        url: 'https://github.com/x/repo',
        description: 'thing',
        tech: ['ts'],
      },
    ])
  }
  if (prompt.includes('You draft a short LinkedIn connection request')) {
    return JSON.stringify({
      kind: 'linkedin_connection',
      applicationId: 'app-1',
      body: 'test connection',
      tone: 'friendly',
      wordCount: 2,
    })
  }
  if (prompt.includes('You draft a follow-up LinkedIn message')) {
    return JSON.stringify({
      kind: 'linkedin_message',
      applicationId: 'app-1',
      body: 'test message',
      tone: 'friendly',
      wordCount: 2,
    })
  }
  if (prompt.includes('You draft an email reply to an INBOUND recruiter')) {
    return JSON.stringify({
      kind: 'recruiter_reply',
      applicationId: 'app-1',
      subject: 'Re: role',
      body: 'test reply',
      tone: 'friendly',
      wordCount: 2,
    })
  }
  if (prompt.includes('You produce an interview prep pack')) {
    return JSON.stringify({
      applicationId: 'app-1',
      stageId: null,
      stageKind: 'tech_screen',
      companyResearch: {
        summary: 'Stripe builds payments infra.',
        industry: ['fintech'],
        notable_facts: [],
        tech_stack: ['go', 'ruby'],
        culture_signals: [],
      },
      likelyQuestions: [
        {
          question: 'Tell me about a time you improved reliability.',
          category: 'behavioral',
          difficulty: 'medium',
          star_answer: {
            situation: 'S',
            task: 'T',
            action: 'A',
            result: 'R',
            cv_bullet_ref: 'built ledger',
          },
        },
      ],
      talkingPoints: ['ledger experience'],
      redFlags: ['on-call rota'],
      yourQuestions: ['first-90-days success', 'team split'],
    })
  }
  return '{}'
}

import { GeminiProvider } from '@/lib/ai/gemini'

function makeMaster(): MasterCV {
  return {
    basics: { name: 'Ada Lovelace', headline: 'Engineer' },
    summary: 'summary',
    experience: [
      {
        company: 'Acme',
        role: 'Eng',
        start: '2020-01',
        end: 'present',
        bullets: ['built things'],
      },
    ],
    skills: { primary: ['ts'] },
  }
}

describe('stripLatexFencing', () => {
  it('strips ```latex fences', () => {
    expect(stripLatexFencing('```latex\n\\documentclass{article}\n```')).toBe(
      '\\documentclass{article}',
    )
  })
  it('strips plain ``` fences', () => {
    expect(stripLatexFencing('```\nhello\n```')).toBe('hello')
  })
  it('is a no-op when no fence', () => {
    expect(stripLatexFencing('\\documentclass{article}')).toBe(
      '\\documentclass{article}',
    )
  })
})

describe('GeminiProvider.generateLatexCV', () => {
  it('returns cleaned source starting with \\documentclass', async () => {
    const p = new GeminiProvider('key')
    const r = await p.generateLatexCV({ master: makeMaster(), templateId: 'moderncv-classic' })
    expect(r.source.startsWith('\\documentclass')).toBe(true)
    expect(r.source).toContain('Hello from LaTeX')
  })
})

describe('FixtureAIProvider.generateLatexCV', () => {
  it('returns a minimal valid document', async () => {
    const p = new FixtureAIProvider()
    const r = await p.generateLatexCV({ master: makeMaster(), templateId: 'moderncv-classic' })
    expect(r.source).toContain('\\documentclass')
    expect(r.source).toContain('\\begin{document}')
    expect(r.source).toContain('\\end{document}')
  })

  it('respects a custom fixture', async () => {
    const p = new FixtureAIProvider({
      generateLatexCV: () => ({ source: '\\documentclass{report}\\begin{document}x\\end{document}' }),
    })
    const r = await p.generateLatexCV({ master: makeMaster(), templateId: 'awesome-cv' })
    expect(r.source).toContain('\\documentclass{report}')
  })
})
