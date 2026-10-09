import { describe, expect, it } from 'vitest'
import { cappedFit, scoreBand } from '@/lib/discovery/match/blend'
import { seniorityComponent } from '@/lib/discovery/match/fit'
import { withImplied } from '@/lib/discovery/match/lexicon'
import { extractRequirements } from '@/lib/discovery/match/requirements'
import { computeMatch } from '@/lib/discovery/match/score'
import { skillsComponent } from '@/lib/discovery/match/skills'
import { MATCH_SCORE_VERSION } from '@/lib/discovery/match/version'
import { matchJob, matchProfile } from './discovery-match-helpers'

/** Review 2026-10-09, B.3: the systematic Match Score misses. */

describe('any-of requirements ("Power BI or Tableau", "AWS/Azure/GCP")', () => {
  const bi = matchJob({ title: 'Data Analyst', descriptionMd: '## Requirements\n- Strong SQL\n- Power BI or Tableau\n- Advanced Excel' })

  it('reads an "or" / slash group as one requirement', () => {
    const reqs = extractRequirements(bi)
    const group = reqs.find((r) => r.anyOf)
    expect(group?.anyOf).toEqual(['power bi', 'tableau'])
    expect(reqs.filter((r) => !r.anyOf && (r.canonical === 'power bi' || r.canonical === 'tableau'))).toEqual([])
    expect(extractRequirements(matchJob({ descriptionMd: '## Requirements\n- AWS/Azure/GCP' })).find((r) => r.anyOf)?.anyOf).toEqual([
      'aws',
      'azure',
      'gcp',
    ])
  })

  it('is met by any member and missing as one item', () => {
    const none = skillsComponent(bi, matchProfile({ skills: withImplied(['sql']) }))
    expect(none.missing).toEqual(['Power BI or Tableau (required)', 'Excel (required)'])
    const tableau = skillsComponent(bi, matchProfile({ skills: withImplied(['sql', 'tableau']) }))
    expect(tableau.missing).toEqual(['Excel (required)'])
    expect(tableau.matched).toContain('Tableau')
  })

  it('"PHP/Laravel or Go" does not list Go as missing for a Laravel profile', () => {
    const job = matchJob({ descriptionMd: '## Requirements\n- PHP/Laravel or Go\n- Kafka' })
    expect(skillsComponent(job, matchProfile()).missing).toEqual(['Kafka (required)'])
  })

  it('keeps "PHP, Laravel and MySQL" as three requirements', () => {
    const reqs = extractRequirements(matchJob({ descriptionMd: '## Requirements\n- PHP, Laravel and MySQL' }))
    expect(reqs.some((r) => r.anyOf)).toBe(false)
  })
})

describe('years asked vs years you have', () => {
  const asks = (n: number, title = 'Backend Developer') =>
    matchJob({ title, descriptionMd: `## Requirements\n- ${n}+ years of backend experience\n- Laravel` })

  it('drops proportionally: 2 years for "5+" keeps well under half the seniority points', () => {
    const c = seniorityComponent(asks(5), matchProfile({ years: 2 }))
    expect(c.points).toBeLessThanOrEqual(7)
    expect(c.label).toMatch(/^Seniority: asks 5\+ yrs, you have 2/)
  })

  it('a 1-year gap is fine; 3 vs 5 is between', () => {
    expect(seniorityComponent(asks(3), matchProfile({ years: 2 })).points).toBe(15)
    const mid = seniorityComponent(asks(5), matchProfile({ years: 3 })).points
    expect(mid).toBeGreaterThan(seniorityComponent(asks(5), matchProfile({ years: 2 })).points)
    expect(mid).toBeLessThan(15)
  })

  it('the strong-domain offset is capped (+3 at most)', () => {
    const plain = seniorityComponent(asks(5), matchProfile({ years: 2, skills: withImplied(['mysql']), domains: new Set() }))
    const strong = seniorityComponent(asks(5), matchProfile({ years: 2 }))
    expect(strong.label).toContain('strong Laravel match')
    expect(strong.points - plain.points).toBeLessThanOrEqual(3)
  })

  it('a Senior title asking 5+ years takes the lower of the two reads', () => {
    const c = seniorityComponent(asks(5, 'Senior Backend Engineer'), matchProfile({ years: 2 }))
    expect(c.points).toBeLessThanOrEqual(7)
  })

  it('reads "2+ years as a data analyst" and "1–3 years in Laravel"', () => {
    expect(seniorityComponent(matchJob({ descriptionMd: '## Requirements\n- 2+ years as a data analyst' }), matchProfile()).label).toBe(
      'Seniority: asks 2+ yrs, you have 2',
    )
    expect(seniorityComponent(matchJob({ descriptionMd: 'We want 1–3 years in Laravel.' }), matchProfile()).label).toBe(
      'Seniority: asks 1+ yrs, you have 2',
    )
  })
})

describe('mandatory language', () => {
  const doha = matchJob({
    location: 'Doha, Qatar',
    descriptionMd: '## Requirements\n- PHP and Laravel\n- MySQL\n- Must be fluent in Arabic.',
  })
  const basic = matchProfile({ languages: new Map([['english', 'fluent'], ['arabic', 'basic']]) })

  it('is a strong penalty with the "Language: Arabic required" chip and a weak-band ceiling', () => {
    const m = computeMatch(doha, basic)
    const lang = m.components.find((c) => c.key === 'language')!
    expect(lang.label).toBe('Language: Arabic required (you: basic)')
    expect(lang.points).toBeLessThanOrEqual(-20)
    expect(m.ceiling).toEqual({ score: 34, reason: 'Language: Arabic required' })
    expect(m.score).toBeLessThanOrEqual(34)
    expect(scoreBand(cappedFit(m.score, 90, m)!)).toBe('weak')
  })

  it('a fluent speaker gets no ceiling', () => {
    const m = computeMatch(doha, matchProfile({ languages: new Map([['arabic', 'fluent']]) }))
    expect(m.ceiling).toBeUndefined()
  })

  it('"Arabic preferred" stays a light touch', () => {
    const m = computeMatch(matchJob({ descriptionMd: '## Requirements\n- Laravel\n- Arabic preferred' }), basic)
    expect(m.ceiling).toBeUndefined()
    expect(m.components.find((c) => c.key === 'language')!.points).toBe(-2)
  })
})

describe('title-only postings (email alerts)', () => {
  it('cap at 55 (low confidence) until a JD is fetched', () => {
    const m = computeMatch(matchJob({ title: 'PHP Developer', descriptionMd: '' }), matchProfile())
    expect(m.confidence).toBe('title_only')
    expect(m.score).toBeLessThanOrEqual(55)
    expect(m.ceiling).toEqual({ score: 55, reason: 'Low confidence: title only' })
    expect(cappedFit(m.score, 90, m)).toBe(55)
  })

  it('a full JD lifts the cap', () => {
    const m = computeMatch(
      matchJob({ title: 'PHP Developer', descriptionMd: '## Requirements\n- 2+ years of PHP and Laravel\n- MySQL and REST APIs\n- Git' }),
      matchProfile(),
    )
    expect(m.confidence).toBe('full')
    expect(m.ceiling).toBeUndefined()
  })
})

describe('cappedFit', () => {
  it('blends, then applies the ceiling; no detail or no ceiling = the plain blend', () => {
    expect(cappedFit(80, 60, null)).toBe(70)
    expect(cappedFit(30, 90, { ceiling: { score: 34 } })).toBe(34)
    expect(cappedFit(null, null, { ceiling: { score: 34 } })).toBeNull()
  })
})

describe('rules version', () => {
  it('is bumped so stored scores recompute', () => {
    expect(MATCH_SCORE_VERSION).toBe('m3')
  })
})
