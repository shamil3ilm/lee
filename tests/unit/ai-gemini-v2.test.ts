import { describe, it, expect, vi } from 'vitest'

// Deterministic Gemini stub returning valid JSON for each call.
vi.mock('@google/generative-ai', () => {
  let call = 0
  class GoogleGenerativeAI {
    getGenerativeModel() {
      return {
        generateContent: async () => {
          call += 1
          const responses = [
            // tailorCV
            JSON.stringify({
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
            }),
            // coverLetter
            JSON.stringify({
              applicationId: 'app-1',
              greeting: 'Dear Hiring Manager,',
              paragraphs: ['p1', 'p2', 'p3'],
              closing: 'Sincerely, Ada',
              senderName: 'Ada',
            }),
            // distillGithub — array shape
            JSON.stringify([
              {
                name: 'repo',
                url: 'https://github.com/x/repo',
                description: 'thing',
                tech: ['ts'],
              },
            ]),
            // distillGithub — wrapped shape
            JSON.stringify({
              projects: [
                {
                  name: 'r2',
                  url: 'https://github.com/x/r2',
                  description: 'other',
                  tech: [],
                },
              ],
            }),
          ]
          const text = responses[(call - 1) % responses.length] ?? '{}'
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
    const p = new GeminiProvider('key')
    const r = await p.distillGithubProjects({ repos: [] })
    expect(r).toHaveLength(1)
    expect(r[0]?.name).toBe('r2')
  })
})
