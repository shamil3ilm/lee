import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BENEFIT_PREFS,
  DEFAULT_LOCATION_PREFS,
  getProfile,
  saveProfile,
} from '@/lib/profile/service'
import { parseCvImport } from '@/lib/profile/importer'
import { FixtureAIProvider } from '@/lib/ai/fixtures'
import { makeUser } from '@/tests/factories'

describe('saveProfile', () => {
  it('seeds default location + benefit prefs on first save', async () => {
    const u = await makeUser()
    const p = await saveProfile(u.id, { headline: 'Backend engineer' })
    expect(p.headline).toBe('Backend engineer')
    expect(p.locationPrefs).toEqual(DEFAULT_LOCATION_PREFS)
    expect(p.benefitPrefs).toEqual(DEFAULT_BENEFIT_PREFS)
  })

  it('does not overwrite existing values on subsequent saves', async () => {
    const u = await makeUser()
    await saveProfile(u.id, { headline: 'Engineer', yearsExperience: 8 })
    const updated = await saveProfile(u.id, { headline: 'Senior Engineer' })
    expect(updated.headline).toBe('Senior Engineer')
    expect(updated.yearsExperience).toBe(8)
    // Second save should NOT re-seed defaults — the existing location prefs remain
    // (they were populated on first save and are preserved by the upsert).
    expect(updated.locationPrefs).toEqual(DEFAULT_LOCATION_PREFS)
  })

  it('allows caller to override defaults on first save', async () => {
    const u = await makeUser()
    const custom = [{ country: 'US', cities: ['SF'], priority: 1 }]
    const p = await saveProfile(u.id, {
      headline: 'Founder',
      locationPrefs: custom as unknown as never,
    })
    expect(p.locationPrefs).toEqual(custom)
  })
})

describe('getProfile', () => {
  it('returns null before any save', async () => {
    const u = await makeUser()
    expect(await getProfile(u.id)).toBeNull()
  })

  it('returns the row after save', async () => {
    const u = await makeUser()
    await saveProfile(u.id, { headline: 'X' })
    const p = await getProfile(u.id)
    expect(p?.headline).toBe('X')
  })
})

describe('parseCvImport', () => {
  it('parses via ai into review items and saves nothing', async () => {
    const u = await makeUser()
    await saveProfile(u.id, { headline: 'Engineer', skills: ['typescript'] })
    const ai = new FixtureAIProvider({
      parseProfile: () => ({
        headline: 'Senior Backend Engineer',
        summary_md: 'Ten years of backend experience.',
        skills: ['typescript', 'postgres'],
        industries: ['fintech'],
        role_types: ['backend'],
        seniority: 'senior',
        years_experience: 10,
        stack_weights: { typescript: 1, postgres: 0.8 },
      }),
    })

    const { proposal, items } = await parseCvImport({ userId: u.id, cvText: '...cv...', ai })
    expect(proposal.yearsExperience).toBe(10)
    const by = (label: string) => items.find((i) => i.label === label)
    expect(by('Headline')).toMatchObject({ status: 'update', isPublic: true })
    expect(by('typescript')).toMatchObject({ status: 'duplicate' })
    expect(by('postgres')).toMatchObject({ status: 'new', hasReadiness: true })
    expect(by('fintech')).toMatchObject({ section: 'matching', isPublic: false })
    const p = await getProfile(u.id)
    expect(p?.headline).toBe('Engineer')
    expect(p?.skills).toEqual(['typescript'])
    expect(p?.locationPrefs).toEqual(DEFAULT_LOCATION_PREFS)
    expect(p?.benefitPrefs).toEqual(DEFAULT_BENEFIT_PREFS)
  })
})
