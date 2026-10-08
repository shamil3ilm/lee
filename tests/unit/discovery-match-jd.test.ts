import { describe, expect, it } from 'vitest'
import { parseJd } from '@/lib/discovery/match/jd'
import { checkLine, requirementChecks, responsibilitiesComponent } from '@/lib/discovery/match/coverage'
import { computeMatch } from '@/lib/discovery/match/score'
import { matchJob, matchProfile } from './discovery-match-helpers'

/** A synthetic GCC fintech JD (no real employer). */
const GCC_JD = [
  '## Job Purpose',
  'Build and maintain payment integrations for merchants across the UAE and KSA.',
  '## Key Responsibilities',
  '- Develop REST APIs and payment gateway webhooks in Laravel',
  '- Integrate ZATCA e-invoicing for Saudi merchants',
  '- Work with product owners to gather requirements',
  '## Requirements',
  '- 3+ years of PHP and Laravel',
  '- MySQL or PostgreSQL',
  '- Kubernetes in production is mandatory',
  "- Bachelor's degree in Computer Science",
  '- Fluent Arabic is required',
  '## Preferred',
  '- AWS Certified Developer',
  '- Redis',
  'Rotational shifts. Employment visa provided.',
].join('\n')

describe('parseJd', () => {
  const jd = parseJd(matchJob({ title: 'Integration Developer', descriptionMd: GCC_JD }))

  it('splits responsibilities, must-haves and nice-to-haves', () => {
    expect(jd.responsibilities.map((l) => l.text)).toContain('Integrate ZATCA e-invoicing for Saudi merchants')
    expect(jd.must.map((l) => l.text)).toEqual(expect.arrayContaining(['3+ years of PHP and Laravel', 'MySQL or PostgreSQL']))
    expect(jd.nice.map((l) => l.text)).toEqual(expect.arrayContaining(['AWS Certified Developer', 'Redis']))
    expect(jd.must.map((l) => l.text)).not.toContain('Redis')
  })

  it('reads years per line and overall, stack, domains, education and certifications', () => {
    expect(jd.must.find((l) => l.text.startsWith('3+ years'))?.years).toBe(3)
    expect(jd.years).toBe(3)
    expect(jd.stack).toEqual(expect.arrayContaining(['php', 'laravel', 'mysql', 'postgresql', 'kubernetes', 'redis']))
    expect(jd.domains).toEqual(expect.arrayContaining(['payments', 'e-invoicing']))
    expect(jd.education.join(' ')).toMatch(/Bachelor/)
    expect(jd.certifications.join(' ')).toMatch(/AWS Certified/)
  })

  it('reads languages, work authorisation and shifts', () => {
    expect(jd.languages).toEqual([{ language: 'arabic', required: true }])
    expect(jd.workAuth).toContain('visa / relocation offered')
    expect(jd.shifts).toBe('rotational shifts')
  })

  it('reads Arabic section headings', () => {
    const ar = parseJd(matchJob({ descriptionMd: 'المسؤوليات\n- تطوير واجهات REST\nالمتطلبات\n- Laravel و MySQL' }))
    expect(ar.must[0]?.skills).toEqual(expect.arrayContaining(['laravel', 'mysql']))
  })

  it('marks a missing or very short JD as title-only', () => {
    expect(parseJd(matchJob({ descriptionMd: '' })).confidence).toBe('title_only')
    expect(parseJd(matchJob({ descriptionMd: 'Apply on our site.' })).confidence).toBe('title_only')
    expect(jd.confidence).toBe('full')
  })
})

describe('requirement coverage', () => {
  const jd = parseJd(matchJob({ descriptionMd: GCC_JD }))
  const checks = requirementChecks(jd, matchProfile())

  it('lists each must-have met / partial / missing with the profile evidence, missing first', () => {
    expect(checks[0]).toMatchObject({ text: 'Kubernetes in production is mandatory', weight: 'must', status: 'missing' })
    expect(checks.find((c) => c.text === '3+ years of PHP and Laravel')).toMatchObject({
      status: 'met',
      evidence: 'Backend Developer (Laravel, MySQL)',
    })
    // "MySQL or PostgreSQL" needs one of them.
    expect(checks.find((c) => c.text === 'MySQL or PostgreSQL')?.status).toBe('met')
  })

  it('lists nice-to-haves too', () => {
    expect(checks.filter((c) => c.weight === 'nice').map((c) => [c.text, c.status])).toEqual([
      ['AWS Certified Developer', 'missing'],
      ['Redis', 'missing'],
    ])
  })

  it('checks soft asks by overlap with ready lines, never guesses', () => {
    const p = matchProfile()
    expect(checkLine({ text: 'Built webhooks for payment gateways', section: 'must', skills: [], years: null }, p).status).toBe('partial')
    expect(checkLine({ text: 'Excellent communication skills', section: 'must', skills: [], years: null }, p).status).toBe('unchecked')
  })

  it('scores responsibilities that match ready work', () => {
    const r = responsibilitiesComponent(jd, matchProfile())
    // Job purpose + three duties; the Laravel webhooks duty matches ready work.
    expect(r.label).toBe('Responsibilities: 1 of 4 match your work')
    expect(r.points).toBe(3)
  })
})

describe('JD, not just the title', () => {
  const devopsJd = [
    '## Responsibilities',
    '- Run our Kubernetes platform and Terraform modules',
    '- Own Prometheus and Grafana alerting',
    '## Requirements',
    '- Kubernetes, Helm and Terraform',
    '- Go for tooling',
    '- AWS networking',
  ].join('\n')
  const laravelJd = [
    '## What you will do',
    '- Build REST APIs and payment webhooks in Laravel',
    '- Maintain MySQL schemas and queues',
    '## Requirements',
    '- PHP and Laravel',
    '- MySQL and REST APIs',
    '- Git',
  ].join('\n')

  it('scores a title-only match with a mismatching JD low', () => {
    const d = computeMatch(matchJob({ title: 'Laravel Developer', location: 'Dubai', descriptionMd: devopsJd }), matchProfile())
    expect(d.score).toBeLessThan(50)
    expect(d.missing).toEqual(expect.arrayContaining(['Kubernetes (required)', 'Terraform (required)']))
  })

  it('scores an unusual title with a strongly matching JD high, labelled from the JD', () => {
    const d = computeMatch(matchJob({ title: 'Payments Operations Technologist', location: 'Riyadh', descriptionMd: laravelJd }), matchProfile())
    expect(d.score).toBeGreaterThanOrEqual(75)
    expect(d.components.find((c) => c.key === 'role')?.label).toBe('Role: Backend (from the JD, new title)')
  })

  it('flags a title-only posting as low confidence', () => {
    const d = computeMatch(matchJob({ title: 'Laravel Developer', descriptionMd: '' }), matchProfile())
    expect(d.confidence).toBe('title_only')
    expect(d.requirements).toEqual([])
  })
})
