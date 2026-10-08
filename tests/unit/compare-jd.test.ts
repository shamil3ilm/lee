import { describe, expect, it } from 'vitest'
import { compareOpportunity } from '@/lib/compare/compare'
import type { OpportunityInput } from '@/lib/compare/inputs'
import { jdStatus, scopeSignals, techInJd, travelSignal, workModeInJd } from '@/lib/compare/jd'
import { assumptionsSchema, currentJobSchema } from '@/lib/compare/types'

// Synthetic JD; no real employer.
const JD = `About the role
You will lead a small team of four engineers and own the architecture of our settlement services.
We use Laravel, PostgreSQL and Kubernetes on AWS; experience with Rust is a plus.
Requirements: 5+ years of backend experience.
This is a hybrid role with 3 days a week in the office. Travel up to 20% to client sites.
Occasional on-call rotation for production incidents.`

describe('JD signals', () => {
  it('reads tech from the full text, each with its line', () => {
    const tech = techInJd(JD)
    expect(tech.map((t) => t.term.toLowerCase())).toEqual(expect.arrayContaining(['laravel', 'postgresql', 'kubernetes', 'aws', 'rust']))
    expect(tech.map((t) => t.term.toLowerCase())).not.toContain('backend')
    expect(tech.find((t) => t.term === 'Rust')?.quote).toBe('experience with Rust is a plus')
  })

  it('reads scope, travel and work mode with the JD line as the source', () => {
    const scope = scopeSignals(JD)
    expect(scope.map((s) => s.text)).toEqual(['Team or leadership scope', 'Ownership or architecture scope', 'Asks for 5+ years of experience'])
    expect(scope[0]!.source.quote).toContain('lead a small team of four engineers')
    expect(travelSignal(JD)[0]).toMatchObject({ text: 'Travel required', effect: -5 })
    expect(workModeInJd(JD)).toEqual({ mode: 'hybrid', quote: 'This is a hybrid role with 3 days a week in the office' })
  })

  it('a short description is thin', () => {
    expect(jdStatus('Senior Engineer. Apply now.')).toBe('thin')
    expect(jdStatus(JD)).toBe('ok')
  })
})

const base: OpportunityInput = {
  key: 'd:00000000-0000-4000-8000-000000000002',
  kind: 'discovery',
  id: '00000000-0000-4000-8000-000000000002',
  title: 'Senior Backend Engineer',
  companyName: 'Synthetic Co',
  location: 'Bengaluru, India',
  remoteType: null,
  employmentType: 'fulltime',
  description: JD,
  salary: null,
  structuredBenefits: {},
  techStack: [],
  url: null,
  href: '/discoveries/00000000-0000-4000-8000-000000000002',
  reputation: null,
}
const current = currentJobSchema.parse({ title: 'Software Engineer', place: 'IN', workMode: 'onsite', ratings: { growth: 3 } })
const profile = { skills: ['Laravel', 'PostgreSQL'], studyLabels: [], domainText: '' }
const run = (job: OpportunityInput) => compareOpportunity({ job, current, assumptions: assumptionsSchema.parse({}), profile, now: new Date('2026-10-08T00:00:00Z') })

describe('comparison from the JD, not the title', () => {
  it('growth and work-life cite JD lines', () => {
    const c = run(base)
    expect(c.jd).toEqual({ status: 'ok', pasted: false, canPaste: true })
    const growth = c.job.criteria.growth.evidence
    expect(growth.find((e) => e.text.startsWith('New to learn'))?.source.quote).toContain('Kubernetes')
    expect(growth.find((e) => e.text === 'Team or leadership scope')).toBeDefined()
    const wl = c.job.criteria.work_life.evidence.map((e) => e.text)
    expect(wl).toEqual(expect.arrayContaining(['Hybrid vs your On-site', 'Travel required', 'Hours or shifts: “on-call”']))
    expect(c.job.criteria.work_life.evidence[0]!.source.quote).toBe('This is a hybrid role with 3 days a week in the office')
  })

  it('with no description the JD criteria are unknown (no description), whatever the title says', () => {
    const c = run({ ...base, description: 'Senior Backend Engineer. Apply now.' })
    expect(c.jd.status).toBe('thin')
    for (const k of ['growth', 'benefits', 'work_life', 'pay'] as const) {
      expect(c.job.scores[k]).toBeNull()
      expect(c.job.criteria[k].evidence[0]!.text).toMatch(/^Unknown \(no description\)/)
    }
  })
})
