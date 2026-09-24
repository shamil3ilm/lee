import { describe, it, expect } from 'vitest'
import { renderPrepPackPdf } from '@/lib/pdf/render'
import type { InterviewPrepPack } from '@/lib/documents/types'

const pack: InterviewPrepPack = {
  applicationId: 'app-1',
  stageId: 'stg-1',
  stageKind: 'tech_screen',
  companyResearch: {
    summary: 'Stripe builds payments infra used by online businesses worldwide.',
    industry: ['fintech', 'payments'],
    notable_facts: ['Processes hundreds of billions in payment volume annually.'],
    tech_stack: ['go', 'ruby', 'kafka'],
    culture_signals: ['remote-friendly', 'engineering-blog-heavy'],
  },
  likelyQuestions: [
    {
      question: 'Design a rate limiter for a public API.',
      category: 'system_design',
      difficulty: 'medium',
      technical_notes: 'Cover token bucket vs sliding window, distributed store.',
    },
    {
      question: 'Tell me about a time you improved reliability of a critical system.',
      category: 'behavioral',
      difficulty: 'medium',
      star_answer: {
        situation: 'Ledger produced ~40 daily settlement errors.',
        task: 'Bring errors under 3 per day within a quarter.',
        action: 'Migrated reconciliation to an event-sourced flow, guarded by flag.',
        result: 'Cut errors 90% and freed 6 ops hours per day.',
        cv_bullet_ref: 'built event-sourced ledger cutting reconciliation errors 90%',
      },
    },
  ],
  talkingPoints: [
    'Direct experience with Go/Kafka event pipelines.',
    'Owned a full ledger migration end-to-end.',
  ],
  redFlags: ['On-call rota shape and typical page volume.', 'Ownership scope at this level.'],
  yourQuestions: [
    'What does success look like in the first 90 days?',
    'How is the team split between platform work and product enablement?',
  ],
}

describe('renderPrepPackPdf', () => {
  it('returns a real PDF buffer', async () => {
    const buf = await renderPrepPackPdf(pack, {
      jobTitle: 'Staff Payments Engineer',
      companyName: 'Stripe',
    })
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.byteLength).toBeGreaterThan(1000)
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  }, 20_000)

  it('renders when optional sections are empty', async () => {
    const buf = await renderPrepPackPdf({
      ...pack,
      talkingPoints: [],
      redFlags: [],
      companyResearch: {
        ...pack.companyResearch,
        notable_facts: [],
        culture_signals: [],
      },
    })
    expect(buf.byteLength).toBeGreaterThan(500)
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  }, 20_000)
})
