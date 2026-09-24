import { describe, it, expect, vi } from 'vitest'

// Deterministic Gemini stub dispatched by prompt content — safe under
// vitest isolate:false (multiple test files sharing the mocked module).
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
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import type { MasterCV } from '@/lib/documents/types'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

function pickResponseByPrompt(prompt: string): string {
  if (prompt.includes('You draft a short LinkedIn connection request')) {
    return JSON.stringify({
      kind: 'linkedin_connection',
      applicationId: 'app-1',
      body: 'Hi Jamie — saw the Stripe billing infra post; I have been building Go/Kafka ledgers and would love to connect.',
      tone: 'friendly',
      wordCount: 20,
      notes: 'concrete ledger overlap',
    })
  }
  if (prompt.includes('You draft a follow-up LinkedIn message')) {
    return JSON.stringify({
      kind: 'linkedin_message',
      applicationId: 'app-1',
      body: 'Hi Jamie — thanks for connecting.\n\nAbout the Staff Payments role: I have been running an event-sourced ledger in Go/Kafka for the past two years and last year cut daily settle errors from ~40 to under 3.\n\nHappy to chat about the design.\nAda',
      tone: 'friendly',
      wordCount: 45,
      notes: 'anchors on concrete result',
    })
  }
  if (prompt.includes('You draft an email reply to an INBOUND recruiter')) {
    return JSON.stringify({
      kind: 'recruiter_reply',
      applicationId: 'app-1',
      subject: 'Re: Staff Payments Engineer at Stripe',
      body: 'Hi Jamie,\n\nThanks for reaching out — very interested. Recent context: Staff Eng at Fintech Corp, own the Kafka ledger clearing ~$X/day.\n\n1. Team split between platform and product enablement?\n2. Comp band for this level in EMEA?\n\nCan jump on 30 min Tuesday afternoon or Wed–Thurs next week.\n\nThanks,\nAda',
      tone: 'friendly',
      wordCount: 60,
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
        culture_signals: ['remote-friendly'],
      },
      likelyQuestions: [
        {
          question: 'Design a rate limiter.',
          category: 'system_design',
          difficulty: 'medium',
          technical_notes: 'Token bucket vs sliding window.',
        },
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
  // v2-era prompts — kept for cross-file compatibility (isolate:false shares
  // this mocked module across ai-gemini-v2.test.ts and this file).
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
    // Cross-file toggle via globalThis so this mock and the v2 test file's
    // mock stay consistent regardless of which vi.mock factory wins under
    // isolate:false.
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
  return '{}'
}

function makeMaster(): MasterCV {
  return {
    basics: { name: 'Ada', headline: 'Engineer' },
    summary: 'Original',
    experience: [
      {
        company: 'Fintech Corp',
        role: 'Staff Engineer',
        start: '2020-01',
        end: 'present',
        bullets: ['built event-sourced ledger cutting reconciliation errors 90%'],
      },
    ],
    skills: { primary: ['go', 'kafka'] },
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
      title: 'Staff Payments Engineer',
      sourceUrl: 'https://stripe.com/jobs/x',
      location: 'Remote',
      remoteType: 'remote',
      employmentType: 'fulltime',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      descriptionMd: 'Build payments infra.',
      parsedMeta: { requirements: ['go'], tech_stack: ['go', 'kafka'] },
      benefits: {},
      postedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      company: {
        id: 'c-1',
        userId: 'u-1',
        name: 'Stripe',
        domain: 'stripe.com',
        headquartersCity: null,
        headquartersCountry: null,
        officeLocations: [],
        remoteFriendly: null,
        size: null,
        stage: null,
        website: null,
        techStack: ['go', 'ruby'],
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

describe('GeminiProvider v4 outreach + prep', () => {
  it('draftOutreach parses linkedin_connection JSON', async () => {
    const p = new GeminiProvider('key')
    const draft = await p.draftOutreach({
      master: makeMaster(),
      application: makeApp(),
      kind: 'linkedin_connection',
      tone: 'friendly',
    })
    expect(draft.kind).toBe('linkedin_connection')
    expect(draft.applicationId).toBe('app-1')
    expect(draft.body.length).toBeGreaterThan(0)
  })

  it('draftOutreach parses linkedin_message JSON', async () => {
    const p = new GeminiProvider('key')
    const draft = await p.draftOutreach({
      master: makeMaster(),
      application: makeApp(),
      kind: 'linkedin_message',
      tone: 'friendly',
    })
    expect(draft.kind).toBe('linkedin_message')
    expect(draft.wordCount).toBeGreaterThan(0)
  })

  it('draftOutreach parses recruiter_reply JSON with subject', async () => {
    const p = new GeminiProvider('key')
    const draft = await p.draftOutreach({
      master: makeMaster(),
      application: makeApp(),
      kind: 'recruiter_reply',
      tone: 'friendly',
    })
    expect(draft.kind).toBe('recruiter_reply')
    expect(draft.subject).toContain('Stripe')
  })

  it('generateInterviewPrepPack parses full prep pack shape', async () => {
    const p = new GeminiProvider('key')
    const pack = await p.generateInterviewPrepPack({
      master: makeMaster(),
      application: makeApp(),
      stageKind: 'tech_screen',
    })
    expect(pack.stageKind).toBe('tech_screen')
    expect(pack.likelyQuestions.length).toBeGreaterThan(0)
    expect(pack.likelyQuestions.find((q) => q.category === 'behavioral')?.star_answer)
      .toBeDefined()
  })
})

describe('FixtureAIProvider v4 outreach + prep', () => {
  it('returns valid OutreachDraft for each kind', async () => {
    const ai = new FixtureAIProvider()
    for (const kind of ['linkedin_connection', 'linkedin_message', 'recruiter_reply'] as const) {
      const draft = await ai.draftOutreach({
        master: makeMaster(),
        application: makeApp(),
        kind,
        tone: 'friendly',
      })
      expect(draft.kind).toBe(kind)
      expect(draft.applicationId).toBe('app-1')
      expect(draft.body.length).toBeGreaterThan(0)
      expect(draft.wordCount).toBeGreaterThan(0)
    }
  })

  it('recruiter_reply fixture includes a subject', async () => {
    const ai = new FixtureAIProvider()
    const draft = await ai.draftOutreach({
      master: makeMaster(),
      application: makeApp(),
      kind: 'recruiter_reply',
      tone: 'formal',
    })
    expect(draft.subject).toBeDefined()
  })

  it('generateInterviewPrepPack returns a valid pack', async () => {
    const ai = new FixtureAIProvider()
    const pack = await ai.generateInterviewPrepPack({
      master: makeMaster(),
      application: makeApp(),
      stageKind: 'tech_screen',
      stageId: 'stg-1',
    })
    expect(pack.applicationId).toBe('app-1')
    expect(pack.stageId).toBe('stg-1')
    expect(pack.stageKind).toBe('tech_screen')
    expect(pack.likelyQuestions.length).toBeGreaterThan(0)
    expect(pack.yourQuestions.length).toBeGreaterThan(0)
  })
})
