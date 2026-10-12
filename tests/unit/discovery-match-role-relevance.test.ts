import { describe, expect, it } from 'vitest'
import { computeMatch } from '@/lib/discovery/match/score'
import { matchProfileFrom } from '@/lib/discovery/match/profile'
import { stripBoilerplate } from '@/lib/discovery/match/boilerplate'
import type { MatchDetail, MatchJob } from '@/lib/discovery/match/types'
import { classifyRole, familiesFromEvidence } from '@/lib/discovery/relevance/roles'
import { normalizeForMatch } from '@/lib/discovery/relevance/text'
import { CALIBRATION_CASES, type CalibrationCase } from '@/tests/eval/calibration-cases'
import { BACKEND_ONLY, BACKEND_PAYMENTS } from '@/tests/eval/discovery-calibration'

/**
 * Role relevance (review 2026-10-10 P0-1…P0-3, P0-6, P1-4): non-tech GCC
 * roles (Careem-style ops, category, training & quality, design) must not
 * read as software jobs, must not collect ~40 context points, and must not
 * earn domain points from the employer's "About us". Synthetic postings.
 */

const NOW = new Date('2026-10-12T00:00:00Z')
const payments = matchProfileFrom(BACKEND_PAYMENTS, NOW)
const backendOnly = matchProfileFrom(BACKEND_ONLY, NOW)

function pick(slice: CalibrationCase['slice'], title: string, location = 'Dubai, United Arab Emirates'): MatchJob {
  const c = CALIBRATION_CASES.find((x) => x.slice === slice && x.job.title === title && x.job.location === location)
  if (!c) throw new Error(`no case ${slice} ${title} ${location}`)
  return c.job
}

const part = (d: MatchDetail, key: string) => d.components.find((c) => c.key === key)!

describe('JD family inference ignores generic business words', () => {
  it.each([
    ['sql is a plus', []],
    ['track kpis and prepare weekly reports in excel; dashboards', []],
    ['strong excel skills and sql is a plus; kpi reporting', []],
  ])('%s → %j', (text, families) => {
    expect(familiesFromEvidence(normalizeForMatch(text))).toEqual(families)
  })

  it('still reads real stacks and real analytics tools', () => {
    expect(familiesFromEvidence(normalizeForMatch('php, laravel and mysql'))).toContain('backend')
    expect(familiesFromEvidence(normalizeForMatch('sql and power bi dashboards'))).toContain('data_analyst')
    expect(familiesFromEvidence(normalizeForMatch('python and pandas for analysis, sql'))).toContain('data_analyst')
  })

  it('recognises GCC non-engineering titles, never generic software ones', () => {
    for (const t of ['Operations Associate', 'Category Executive', 'Training & Quality Executive', 'Strategy & Transformation Associate', 'Partner Success Manager', 'Fleet Operations Executive', 'Mandoub', 'Dean, College of Business']) {
      expect(classifyRole({ title: t }).engineering, t).toBe(false)
    }
    for (const t of ['Associate Software Engineer', 'Software Engineer', 'IT Systems Developer', 'Application Developer']) {
      expect(classifyRole({ title: t }).engineering, t).toBe(true)
    }
  })
})

describe('non-tech roles are capped in the weak band', () => {
  it.each([
    ['nontech', 'Operations Associate'],
    ['nontech', 'Senior Operations Associate - Shops'],
    ['nontech', 'Category Executive'],
    ['nontech', 'Training & Quality Executive'],
    ['nontech', 'Customer Care Executive'],
    ['boilerplate', 'Operations Associate'],
    ['boilerplate', 'Category Executive'],
  ] as const)('%s %s: role 0, "not a tech role" ceiling 25', (slice, title) => {
    const d = computeMatch(pick(slice, title), payments)
    expect(part(d, 'role')).toMatchObject({ points: 0, label: 'Role: not a tech role' })
    expect(d.ceiling).toEqual({ score: 25, reason: `Not a tech role: ${title}` })
    expect(d.score).toBeLessThanOrEqual(25)
  })

  it('earns no "general software engineering" credit or neutral skills for a non-engineering title', () => {
    const d = computeMatch(pick('nontech', 'Strategy & Transformation Associate'), backendOnly)
    expect(part(d, 'role').label).not.toMatch(/general software/)
    expect(part(d, 'skills').points).toBe(0)
  })

  it('a product designer whose JD mentions SQL and Excel is still not a backend role', () => {
    const d = computeMatch(pick('nontech', 'Senior Product Designer'), payments)
    expect(part(d, 'role').points).toBe(0)
    expect(d.score).toBeLessThanOrEqual(25)
  })
})

describe('off-target tech roles are capped at 45 and their context points count half', () => {
  it('a Frontend Developer in Dubai for a backend profile', () => {
    const frontend = computeMatch(pick('adjacent', 'Frontend Developer'), payments)
    expect(frontend.ceiling).toEqual({ score: 45, reason: 'Role outside your targets: Frontend' })
    expect(frontend.score).toBeLessThanOrEqual(45)
    const laravel = computeMatch(pick('ontarget-gcc', 'Laravel Developer'), payments)
    expect(part(frontend, 'region').points).toBe(Math.round(part(laravel, 'region').points / 2))
    expect(part(frontend, 'region').label).toMatch(/counts half: role outside your targets/)
  })

  it('a non-tech role keeps none of the context points', () => {
    const d = computeMatch(pick('nontech', 'Category Executive'), payments)
    for (const key of ['seniority', 'region', 'workMode', 'visa']) expect(part(d, key).points, key).toBeLessThanOrEqual(0)
  })
})

describe('employer boilerplate does not earn domain points', () => {
  it('strips About us and Benefits sections, keeps the role', () => {
    const text = '## About us\nWe run payments and a wallet.\n\n## Responsibilities\n- Build Laravel APIs\n\n## Benefits\n- Wallet credits'
    expect(stripBoilerplate(text)).toBe('## Responsibilities\n- Build Laravel APIs')
  })

  it('a backend role whose only payments words are in the About us gets no domain bonus', () => {
    const job: MatchJob = {
      title: 'Backend Developer',
      location: 'Dubai, United Arab Emirates',
      remoteType: 'onsite',
      descriptionMd: '## About us\nThe region\'s super app for rides, food and payments through our wallet.\n\n## Responsibilities\n- Build REST APIs in Laravel for our restaurant catalogue\n- Maintain MySQL schemas\n\n## Requirements\n- 2+ years of PHP and Laravel\n- MySQL and REST APIs',
    }
    const d = computeMatch(job, payments)
    expect(part(d, 'domain')).toMatchObject({ points: 0 })
    expect(part(d, 'seniority').label).not.toMatch(/strong payments/)
  })
})

describe('good jobs stay high', () => {
  it.each([
    ['ontarget-gcc', 'Laravel Developer', 'Dubai, United Arab Emirates'],
    ['ontarget-gcc', 'ZATCA Integration Developer', 'Riyadh, Saudi Arabia'],
    ['ontarget-gcc', 'Payments Backend Developer', 'Kuwait City, Kuwait'],
    ['ontarget-gcc', 'API Integration Developer', 'Dubai, United Arab Emirates'],
    ['ontarget-india-remote', 'Laravel Developer', 'Remote - Worldwide'],
  ] as const)('%s %s (%s) ≥ 70 with no ceiling', (slice, title, location) => {
    const d = computeMatch(pick(slice, title, location), payments)
    expect(d.ceiling).toBeUndefined()
    expect(d.score).toBeGreaterThanOrEqual(70)
  })
})
