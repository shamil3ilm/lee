import { describe, expect, it } from 'vitest'
import type { MasterCV, TailoredCV } from '@/lib/documents/types'
import { applySuggestions } from '@/lib/cv-fit/tailor/apply'
import { planTailoring } from '@/lib/cv-fit/tailor/plan'
import { loadAcademyContent } from '@/lib/academy/content/catalog'
import { checkWorkFacts, type WorkFact } from '@/lib/resume/work-facts'
import { renderVariant } from '@/lib/variants/render'
import { lockTailoredCv } from '@/lib/variants/tailor-lock'
import { TAILOR_JD, tailorProfile, tailorRecipe } from '@/tests/fixtures/resume/tailor'

/**
 * Tailoring keeps every job's position, employer and dates exactly as held
 * (spec §5.3): background checks and GCC paperwork compare them with the
 * employer's letter. The number lock guards bullets; this guards job lines.
 */

const master: WorkFact[] = [
  { employer: 'PayCo', position: 'Backend Engineer', start: '2022-01', end: 'present' },
  { employer: 'ShopCo', position: 'Software Engineer', start: '2019-06', end: '2021-12' },
]

describe('checkWorkFacts', () => {
  it('passes the same jobs (employer case aside) and a subset', () => {
    expect(checkWorkFacts([{ ...master[0]!, employer: 'payco' }], master).ok).toBe(true)
  })

  it('flags a changed position, changed dates and an unknown employer', () => {
    const r = checkWorkFacts(
      [
        { ...master[0]!, position: 'Senior Backend Engineer' },
        { ...master[1]!, start: '2018-01' },
        { employer: 'BigCo', position: 'Engineer', start: '2020-01', end: '2021-01' },
      ],
      master,
    )
    expect(r.ok).toBe(false)
    expect(r.problems).toEqual([
      'PayCo: position “Senior Backend Engineer” ≠ “Backend Engineer”',
      'ShopCo: dates 2018-01–2021-12 ≠ 2019-06–2021-12',
      'BigCo: not an employer on your profile',
    ])
  })
})

function cv(experience: MasterCV['experience']): MasterCV {
  return {
    basics: { name: 'Rae Example', email: 'rae@example.com', headline: 'Backend Engineer' },
    summary: 'Backend engineer working on payments.',
    experience,
    projects: [],
    education: [],
    skills: [],
    certifications: [],
  } as unknown as MasterCV
}

describe('AI tailoring lock (lockTailoredCv)', () => {
  it('puts a rewritten job title and dates back to the master’s', () => {
    const starting = cv([
      { company: 'PayCo', role: 'Backend Engineer', start: '2022-01', end: 'present', bullets: ['Built payment webhooks in Laravel.'] },
    ])
    const answer = {
      ...cv([
        { company: 'PayCo', role: 'Senior Backend Engineer (Payments Lead)', start: '2020-01', end: 'present', bullets: ['Built payment webhooks in Laravel.'] },
      ]),
      _tailoring: { reasoning: 'Tailored.', reordered_experience_indices: [] },
    } as unknown as TailoredCV
    const { cv: locked, restored } = lockTailoredCv(answer, starting)
    expect(restored).toBe(1)
    expect(locked.experience[0]).toMatchObject({ company: 'PayCo', role: 'Backend Engineer', start: '2022-01', end: 'present' })
    expect(locked._tailoring.reasoning).toMatch(/job title and dates as held/)
    const facts = (x: MasterCV) => x.experience.map((e) => ({ employer: e.company, position: e.role, start: e.start, end: e.end }))
    expect(checkWorkFacts(facts(locked), facts(starting)).ok).toBe(true)
  })
})

describe('recipe tailoring (Prepare › Tailor)', () => {
  it('a tailored variant’s positions, employers and dates equal the master profile’s', () => {
    const profile = tailorProfile()
    const plan = planTailoring({ profile, recipe: tailorRecipe(), job: TAILOR_JD, years: 4, graph: loadAcademyContent().graph })
    const tailored = applySuggestions(profile, tailorRecipe(), plan.suggestions)
    const rendered = renderVariant(profile, tailored)
    const work = rendered.sections.find((s) => s.key === 'work')!.entries
    const shown: WorkFact[] = work.map((e) => ({ employer: e.subtitle, position: e.title, start: e.dates.split(' – ')[0] ?? '', end: e.dates.split(' – ')[1] ?? '' }))
    const masterShown: WorkFact[] = renderVariant(profile, tailorRecipe())
      .sections.find((s) => s.key === 'work')!
      .entries.map((e) => ({ employer: e.subtitle, position: e.title, start: e.dates.split(' – ')[0] ?? '', end: e.dates.split(' – ')[1] ?? '' }))
    expect(work.length).toBeGreaterThan(0)
    expect(checkWorkFacts(shown, masterShown)).toEqual({ ok: true, problems: [] })
    for (const e of work) {
      const w = profile.work.find((x) => x.id === e.id)!
      expect(e.title).toBe(w.position)
      expect(e.subtitle).toBe(w.name)
    }
  })
})
