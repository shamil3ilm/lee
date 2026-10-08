import { describe, expect, it } from 'vitest'
import {
  FIT_MAX,
  regionComponent,
  roleComponent,
  seniorityComponent,
  workModeComponent,
} from '@/lib/discovery/match/fit'
import { matchJob, matchProfile } from './discovery-match-helpers'

describe('roleComponent', () => {
  it('gives full points for a target family named by the title', () => {
    expect(roleComponent(matchJob({ title: 'Laravel Developer' }), matchProfile())).toMatchObject({
      points: FIT_MAX.role,
      label: 'Role: Backend',
    })
  })

  it('gives most points to a generic software title, a little to another family, none to non-engineering', () => {
    expect(roleComponent(matchJob({ title: 'Software Engineer' }), matchProfile()).points).toBe(10)
    expect(roleComponent(matchJob({ title: 'iOS Engineer' }), matchProfile())).toMatchObject({
      points: 4,
      label: 'Role: Mobile (not a target)',
    })
    expect(roleComponent(matchJob({ title: 'Relationship Manager - Corporate Banking' }), matchProfile()).points).toBe(0)
  })

  it('honours custom role targets literally', () => {
    const r = roleComponent(matchJob({ title: 'ZATCA Integration Specialist' }), matchProfile({ customRoles: ['ZATCA Integration'] }))
    expect(r).toMatchObject({ points: FIT_MAX.role, label: 'Role: ZATCA Integration' })
  })
})

describe('seniorityComponent', () => {
  it('fits a junior or mid title for a junior–mid target', () => {
    expect(seniorityComponent(matchJob({ title: 'Junior PHP Developer' }), matchProfile()).points).toBe(FIT_MAX.seniority)
  })

  it('scores a senior title one step above the targets low, and lead or above at zero', () => {
    expect(seniorityComponent(matchJob({ title: 'Senior Backend Engineer' }), matchProfile())).toMatchObject({
      points: 4,
      label: 'Seniority: Senior (you target Junior–Mid-level)',
    })
    expect(seniorityComponent(matchJob({ title: 'Staff Engineer' }), matchProfile()).points).toBe(0)
  })

  it('compares years asked with the years the profile shows', () => {
    const ok = seniorityComponent(matchJob({ descriptionMd: '2+ years of experience with Laravel' }), matchProfile({ years: 2 }))
    expect(ok).toMatchObject({ points: FIT_MAX.seniority, label: 'Seniority: asks 2+ yrs, you have 2' })
    const stretch = seniorityComponent(matchJob({ descriptionMd: 'Minimum 5 years experience' }), matchProfile({ years: 2 }))
    expect(stretch.points).toBe(7)
    const far = seniorityComponent(matchJob({ descriptionMd: '8+ years of backend experience' }), matchProfile({ years: 2 }))
    expect(far.points).toBe(0)
  })

  it('is mildly positive when neither title nor description states a level', () => {
    expect(seniorityComponent(matchJob(), matchProfile()).points).toBe(12)
  })

  it('derives targets from years when no levels are selected', () => {
    const r = seniorityComponent(matchJob({ title: 'Mid-level Developer' }), matchProfile({ seniority: [], years: 3 }))
    expect(r.points).toBe(FIT_MAX.seniority)
  })
})

describe('regionComponent (GCC spellings)', () => {
  const at = (location: string, remoteType = 'onsite') => regionComponent(matchJob({ location, remoteType }), matchProfile())

  it.each([
    ['Dubai - UAE', 'UAE'],
    ['Abu Dhabi, AE', 'UAE'],
    ['دبي', 'UAE'],
    ['Riyadh, Saudi Arabia', 'Saudi Arabia'],
    ['Jeddah, KSA', 'Saudi Arabia'],
    ['Doha, Qatar', 'Qatar'],
    ['Kuwait City', 'Kuwait'],
    ['Manama, Bahrain', 'Bahrain'],
    ['Muscat, Oman', 'Oman'],
  ])('places %s in the target region %s', (location, label) => {
    expect(at(location)).toMatchObject({ points: FIT_MAX.region, label: `Region: ${label}` })
  })

  it('scores a posting outside the targets at zero and an unstated location as neutral', () => {
    expect(at('Berlin, Germany')).toMatchObject({ points: 0, label: 'Region: Berlin (outside your regions)' })
    expect(at('')).toMatchObject({ points: 5, label: 'Region: location not stated' })
  })

  it('reads remote eligibility', () => {
    expect(at('Remote', 'remote')).toMatchObject({ points: 8, label: 'Remote, open to your region' })
    expect(at('Remote - UAE', 'remote')).toMatchObject({ points: FIT_MAX.region, label: 'Remote in UAE' })
    expect(at('Remote (US only)', 'remote')).toMatchObject({ points: 0, label: 'Remote, US-only' })
  })

  it('is neutral when the user set no target regions', () => {
    expect(regionComponent(matchJob(), matchProfile({ regions: [], otherCountries: [] })).points).toBe(5)
  })
})

describe('workModeComponent', () => {
  it('matches the preference, partly matches neighbours, and is neutral when unstated', () => {
    const remote = matchProfile({ remotePref: 'remote' })
    expect(workModeComponent(matchJob({ remoteType: 'remote' }), remote).points).toBe(5)
    expect(workModeComponent(matchJob({ remoteType: 'hybrid' }), remote).points).toBe(3)
    expect(workModeComponent(matchJob({ remoteType: 'onsite' }), remote)).toMatchObject({
      points: 0,
      label: 'Work mode: On-site (you prefer remote)',
    })
    expect(workModeComponent(matchJob({ remoteType: 'unknown', location: 'Doha' }), remote).points).toBe(3)
  })

  it('detects hybrid in the location text and accepts anything for "any"', () => {
    expect(workModeComponent(matchJob({ remoteType: 'unknown', location: 'Dubai (Hybrid)' }), matchProfile({ remotePref: 'hybrid' })).points).toBe(5)
    expect(workModeComponent(matchJob({ remoteType: 'onsite' }), matchProfile({ remotePref: 'any' })).points).toBe(5)
  })
})
