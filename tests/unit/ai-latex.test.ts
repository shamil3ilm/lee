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

function pickResponseByPrompt(prompt: string): string {
  if (prompt.includes('You produce a COMPLETE, VALID LaTeX document')) {
    return JSON.stringify({
      source:
        '\\documentclass{article}\n\\begin{document}\nHello from LaTeX.\n\\end{document}\n',
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
