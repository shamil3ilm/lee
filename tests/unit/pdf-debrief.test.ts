import { describe, it, expect } from 'vitest'
import { renderDebriefPdf } from '@/lib/pdf/render'
import type { InterviewDebrief } from '@/lib/documents/types'

const debrief: InterviewDebrief = {
  stageId: 'stg-1',
  applicationId: 'app-1',
  summary:
    'Recruiter screen with Jamie at Stripe. Talked shop about billing infra and reconciled expectations on scope.',
  wentWell: [
    'Ledger story landed — Jamie asked two follow-up questions.',
    'Established rapport in the first 90 seconds.',
  ],
  toImprove: [
    'Sharpen the SQL join answer — leaned on window functions when a group-by was clearer.',
    'Bring a crisper 30-second version of the team-conflict story.',
  ],
  questionsAsked: [
    {
      question: 'Tell me about a system you had to migrate under load.',
      myAnswerQuality: 'strong',
      note: 'Ledger migration story was concrete; kept the metric front-loaded.',
    },
    {
      question: 'Design a rate limiter.',
      myAnswerQuality: 'ok',
      note: 'Missed the redis pipelining tradeoff — worth a 10-min drill.',
    },
  ],
  redFlags: ['On-call rota sounded heavy — need to probe next round.'],
  followUpRecommendations: [
    'Send thank-you within 24h referencing the ledger discussion.',
    'Draft a rate-limiter mini-writeup and attach to the thank-you.',
  ],
  outcomeConfidence: 'likely_advance',
  reasoning:
    'Recruiter closed with "we\'ll be in touch by Friday" which is stronger than the generic follow-up. Ledger story lined up with what they described as the priority team problem.',
}

describe('renderDebriefPdf', () => {
  it('returns a real PDF buffer', async () => {
    const buf = await renderDebriefPdf(debrief, {
      stageKind: 'recruiter_screen',
      jobTitle: 'Staff Payments Engineer',
      companyName: 'Stripe',
    })
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.byteLength).toBeGreaterThan(1000)
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  }, 20_000)

  it('renders when optional sections are empty', async () => {
    const buf = await renderDebriefPdf({
      ...debrief,
      wentWell: [],
      toImprove: [],
      questionsAsked: [],
      redFlags: [],
      followUpRecommendations: [],
      summary: '',
      reasoning: '',
    })
    expect(buf.byteLength).toBeGreaterThan(500)
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  }, 20_000)
})
