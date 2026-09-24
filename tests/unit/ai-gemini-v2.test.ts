import { describe, it, expect, vi } from 'vitest'

// Deterministic Gemini stub. Uses prompt-content dispatch (instead of a
// per-call counter) so this mock coexists with other test files' vi.mock of
// the same module under vitest isolate:false — see ai-outreach.test.ts.
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

import { GeminiProvider } from '@/lib/ai/gemini'
import type { MasterCV } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

// Cross-file shared toggle (see comment in the mock above). Vitest with
// isolate:false shares module state across test files, so `let` at module
// scope here would ONLY be seen by this file's mock — but this file's mock
// may not be the winning factory. Use globalThis for cross-file signaling.
function setDistillShape(s: 'array' | 'wrapped') {
  ;(globalThis as { __distillShape?: 'array' | 'wrapped' }).__distillShape = s
}

function pickResponseByPrompt(prompt: string): string {
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
    // Test cases toggle __distillShape on globalThis to exercise both
    // wrapping styles across possibly-shared mock instances.
    const shape =
      (globalThis as { __distillShape?: 'array' | 'wrapped' }).__distillShape ?? 'array'
    if (shape === 'wrapped') {
      return JSON.stringify({
        projects: [
          {
            name: 'r2',
            url: 'https://github.com/x/r2',
            description: 'other',
            tech: [],
          },
        ],
      })
    }
    return JSON.stringify([
      {
        name: 'repo',
        url: 'https://github.com/x/repo',
        description: 'thing',
        tech: ['ts'],
      },
    ])
  }
  // Outreach + prep pack prompts — return a valid shape so cross-file mock
  // sharing does not blow up if another test file's request hits this mock.
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
    // Return a pack with at least one behavioral question so ai-outreach's
    // assertion (behavioral question has star_answer) still passes when this
    // file's mock is the winning factory under isolate:false.
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

function makeMaster(): MasterCV {
  return {
    basics: { name: 'Ada', headline: 'Engineer' },
    summary: 'Original',
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

function makeApp(): ApplicationWithJob {
  return {
    id: 'app-1',
    userId: 'u-1',
    jobId: 'j-1',
    status: 'saved',
    source: null,
    referredByContactId: null,
    interestLevel: null,
    appliedAt: null,
    nextActionAt: null,
    priority: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    job: {
      id: 'j-1',
      userId: 'u-1',
      companyId: 'c-1',
      title: 'Senior Engineer',
      sourceUrl: 'https://x.com/j',
      location: 'Remote',
      remoteType: 'remote',
      employmentType: 'fulltime',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      descriptionMd: 'Great job',
      parsedMeta: { requirements: ['ts'], tech_stack: ['ts'] },
      benefits: {},
      postedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      company: {
        id: 'c-1',
        userId: 'u-1',
        name: 'Acme',
        domain: 'acme.com',
        headquartersCity: null,
        headquartersCountry: null,
        officeLocations: [],
        remoteFriendly: null,
        size: null,
        stage: null,
        website: null,
        techStack: [],
        isWatched: false,
        stance: null,
        interestLevel: null,
        notesMd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  } as ApplicationWithJob
}

describe('GeminiProvider v2 CV methods', () => {
  it('tailorCV parses TailoredCV JSON', async () => {
    const p = new GeminiProvider('key')
    const r = await p.tailorCV({ master: makeMaster(), application: makeApp() })
    expect(r._tailoring.applicationId).toBe('app-1')
    expect(r._tailoring.summary_rewrite).toBe(true)
  })

  it('draftCoverLetter parses CoverLetter JSON', async () => {
    const p = new GeminiProvider('key')
    const r = await p.draftCoverLetter({ master: makeMaster(), application: makeApp() })
    expect(r.senderName).toBe('Ada')
    expect(r.paragraphs.length).toBeGreaterThanOrEqual(1)
  })

  it('distillGithubProjects accepts a bare array', async () => {
    setDistillShape('array')
    const p = new GeminiProvider('key')
    const r = await p.distillGithubProjects({
      repos: [
        {
          name: 'repo',
          description: null,
          url: 'https://github.com/x/repo',
          primaryLanguage: 'TypeScript',
          stargazers: 5,
          updatedAt: '2026-01-01',
        },
      ],
    })
    expect(r).toHaveLength(1)
    expect(r[0]?.name).toBe('repo')
  })

  it('distillGithubProjects unwraps a {projects:[...]} object', async () => {
    setDistillShape('wrapped')
    const p = new GeminiProvider('key')
    const r = await p.distillGithubProjects({ repos: [] })
    expect(r).toHaveLength(1)
    expect(r[0]?.name).toBe('r2')
  })
})
