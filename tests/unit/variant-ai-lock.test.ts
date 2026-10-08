import { describe, expect, it } from 'vitest'
import { masterCvSchema, type TailoredCV } from '@/lib/documents/types'
import { buildResumeVariantPrompt } from '@/lib/ai/prompts/resume-variant'
import { buildTailorCVPrompt, TAILOR_CV_PROMPT_VERSION } from '@/lib/ai/prompts/tailor-cv'
import { toMasterCv } from '@/lib/resume/derive'
import { projectSchema, type ResumeProfile } from '@/lib/resume/types'
import { filterProposal, itemsForAi } from '@/lib/variants/proposals'
import { lockTailoredCv } from '@/lib/variants/tailor-lock'
import { syntheticProfile } from '@/tests/fixtures/resume/profile'
import type { ApplicationWithJob } from '@/lib/db/queries/applications'

/**
 * Fact lock + readiness for everything the AI touches: variant proposals
 * and per-job tailoring can never pick a not-ready item, invent a number,
 * or phrase design-only work as implementation.
 */

function profileWithStudyItems(): ResumeProfile {
  const p = syntheticProfile()
  return {
    ...p,
    work: p.work.map((w) => ({
      ...w,
      highlights: w.highlights.map((h) =>
        h.id === 'h-zatca'
          ? { ...h, depth: 'ai_assisted' as const, interviewReady: false, domainReady: true, alternates: [{ id: 'w-d', text: 'Designed the ZATCA clearance flow for 3 Saudi merchants.', source: 'user' as const }] }
          : h,
      ),
    })),
    projects: [
      ...p.projects,
      projectSchema.parse({ id: 'pr-vibe', name: 'Vibe DNS', description: 'DNS server in Go', keywords: ['Go'], depth: 'ai_assisted', highlights: [{ id: 'h-dns', text: 'Answers 50k queries per second.', depth: 'ai_assisted' }] }),
    ],
  }
}

describe('variant proposals', () => {
  const profile = profileWithStudyItems()
  const offered = itemsForAi(profile)

  it('never offers a not-ready item to the AI; design-only items go in design wording', () => {
    const ids = offered.map((i) => i.id)
    expect(ids).not.toContain('pr-vibe')
    expect(ids).not.toContain('h-dns')
    expect(offered.find((i) => i.id === 'h-zatca')).toMatchObject({ designOnly: true, text: 'Designed the ZATCA clearance flow for 3 Saudi merchants.' })
    const prompt = buildResumeVariantPrompt({ region: 'gcc', roleFamily: 'payments', headline: '', summary: '', items: offered })
    expect(prompt).not.toContain('Vibe DNS')
    expect(prompt).not.toContain('50k')
    expect(prompt).toContain('DESIGN-ONLY')
  })

  it('drops not-ready picks and wordings that break the fact or domain lock', () => {
    const r = filterProposal(profile, offered, {
      headline: 'Payments engineer, 7 years',
      summary: 'Ships idempotent payouts at 2M+ requests per day.',
      selectedIds: ['h-payouts', 'pr-vibe', 'h-dns', 'h-zatca', 'h-payouts'],
      wordings: [
        { id: 'h-payouts', text: 'Idempotent payouts API in Go at 2M+ requests/day' },
        { id: 'h-ledger', text: 'Cut reconciliation errors by 95% with a PostgreSQL ledger' },
        { id: 'h-zatca', text: 'Implemented ZATCA clearance for 3 Saudi merchants' },
        { id: 'h-zatca', text: 'Specified ZATCA clearance rules for 3 Saudi merchants' },
        { id: 'h-dns', text: 'Answers 50k queries per second' },
      ],
    })
    expect(r.selectedIds).toEqual(['h-payouts', 'h-zatca'])
    expect(r.wordings).toEqual([
      { highlightId: 'h-payouts', text: 'Idempotent payouts API in Go at 2M+ requests/day' },
      { highlightId: 'h-zatca', text: 'Specified ZATCA clearance rules for 3 Saudi merchants' },
    ])
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'Not an interview-ready item in your profile.',
      'Not an interview-ready item in your profile.',
      'Numbers not in the original: 95',
      'Phrase this as design or domain work — it claims implementation: implemented',
      'Not an interview-ready highlight in your profile.',
    ])
    expect(r.flags).toEqual(['Headline: Numbers not in the original: 7'])
  })
})

describe('tailoring', () => {
  const app = { id: 'app-1', job: { title: 'Payments Engineer', company: { name: 'Example Pay' }, parsedMeta: {}, descriptionMd: '' } } as unknown as ApplicationWithJob

  it('the starting CV and prompt never contain a not-ready item (prompt v1.1.0)', () => {
    const start = toMasterCv(profileWithStudyItems())!
    const prompt = buildTailorCVPrompt({ master: start, application: app, variant: { name: 'GCC · Payments', version: 3, domainOnly: ['Designed the ZATCA clearance flow for 3 Saudi merchants.'] } })
    expect(TAILOR_CV_PROMPT_VERSION).toBe('1.1.0')
    expect(prompt).not.toContain('Vibe DNS')
    expect(prompt).toContain('RÉSUMÉ VARIANT "GCC · Payments" v3')
    expect(prompt).toContain('- Designed the ZATCA clearance flow for 3 Saudi merchants.')
  })

  it('the AI answer is locked to the starting CV: no new employer, project or number', () => {
    const start = masterCvSchema.parse(toMasterCv(syntheticProfile()))
    const answer: TailoredCV = {
      ...start,
      summary: 'Backend engineer who built a DNS server answering 50k queries per second.',
      experience: [
        { ...start.experience[0]!, bullets: [...start.experience[0]!.bullets, 'Scaled DNS to 50k queries per second.'] },
        { company: 'Vibe DNS', role: 'Founder', start: '2024', end: 'present', bullets: ['Wrote it all.'] },
      ],
      projects: [...(start.projects ?? []), { name: 'Vibe DNS', description: 'DNS', highlights: [] }],
      _tailoring: { applicationId: 'app-1', reasoning: 'Focused on payments.', highlighted_skills: [], reordered_experience_indices: [0], summary_rewrite: true },
    }
    const { cv, dropped } = lockTailoredCv(answer, start)
    expect(dropped).toBe(4)
    expect(cv.summary).toBe(start.summary)
    expect(cv.experience.map((e) => e.company)).toEqual(['PayFlow'])
    expect(cv.experience[0]!.bullets).toEqual(start.experience[0]!.bullets)
    expect(cv.projects?.map((p) => p.name)).toEqual(['Open Ledger'])
    expect(cv._tailoring.reasoning).toContain('removed 4 lines')
  })
})
