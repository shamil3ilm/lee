import { describe, expect, it } from 'vitest'
import { mergeLocationPrefs, searchPrefsPatch } from '@/lib/discovery/relevance/form'
import { searchPrefsFormValues, lookingForView } from '@/lib/discovery/relevance/view'
import { buildScoreJobPrompt, SCORE_JOB_PROMPT_VERSION } from '@/lib/ai/prompts/score-job'
import { applyCaps, PREFERENCE_CAPS } from '@/lib/discovery/scoring'
import type { UserProfile } from '@/lib/db/queries/profile'
import type { NormalizedJob } from '@/lib/discovery/adapters/types'

function fd(entries: Array<[string, string]>): FormData {
  const f = new FormData()
  for (const [k, v] of entries) f.append(k, v)
  return f
}

describe('search preferences form', () => {
  it('builds a validated profile patch', () => {
    const now = new Date('2026-09-27T10:00:00Z')
    const patch = searchPrefsPatch(
      fd([
        ['roleFamily', 'backend'],
        ['roleFamily', 'fullstack'],
        ['roleFamily', 'bogus'],
        ['customRoles', 'Odoo Consultant, '],
        ['seniority', 'mid'],
        ['seniority', 'junior'],
        ['seniority', 'wizard'],
        ['region', 'AE'],
        ['region', 'IN'],
        ['region', 'XX'],
        ['otherCountries', 'sg, usa, ae'],
        ['remoteScope', 'worldwide'],
        ['keywords', 'Laravel, PHP'],
        ['dealbreakers', 'gambling'],
        ['rule_sales', 'hard'],
        ['rule_shifts', 'off'],
        ['rule_bogus', 'hard'],
        ['basedIn', 'in'],
        ['sponsorshipFor', 'AE'],
        ['sponsorshipFor', 'SA'],
        ['payGccMonthlyAed', '8,000'],
        ['payIndiaLpa', '7.5'],
        ['langName', 'English'],
        ['langLevel', 'professional'],
        ['langName', 'Arabic'],
        ['langLevel', 'basic'],
        ['langName', ''],
        ['langLevel', 'fluent'],
        ['notice', 'immediate'],
        ['notice', '1_month'],
        ['notice', 'never'],
        ['relocationIfSponsored', 'on'],
        ['relocationCountries', 'de, uk, eu, x1'],
        ['share_visa', 'on'],
        ['share_notice', 'on'],
      ]),
      null,
      now,
    )
    expect(patch).toMatchObject({
      roleTypes: ['backend', 'fullstack', 'Odoo Consultant'],
      seniorityLevels: ['junior', 'mid'],
      remoteScope: 'worldwide',
      acceptRelocation: false,
      keywords: ['Laravel', 'PHP'],
      dealbreakers: ['gambling'],
      searchPrefsSavedAt: now,
    })
    expect((patch.locationPrefs as Array<{ country: string }>).map((l) => l.country)).toEqual(['AE', 'IN', 'SG'])
    expect(patch.discoveryPrefs).toEqual({
      rules: { sales: 'hard', shifts: 'off' },
      basedIn: 'IN',
      sponsorshipFor: ['AE', 'SA'],
      payFloors: [
        { scope: 'GCC', amount: 8000, currency: 'AED', period: 'month' },
        { scope: 'IN', amount: 750_000, currency: 'INR', period: 'year' },
      ],
      languages: [
        { name: 'English', level: 'professional' },
        { name: 'Arabic', level: 'basic' },
      ],
      noticePeriods: ['immediate', '1_month'],
      relocationIfSponsored: true,
      relocationCountries: ['DE', 'UK', 'EU'],
      share: { visa: true, notice: true, relocation: false, timezone: false, nationality: false },
      preferredRegions: [],
      companyStages: [],
    })
  })

  it('saves the preferred work mode and derives the profile seniority from the levels', () => {
    const patch = searchPrefsPatch(
      fd([
        ['seniority', 'junior'],
        ['seniority', 'mid'],
        ['remotePref', 'hybrid'],
      ]),
      null,
    )
    expect(patch.remotePref).toBe('hybrid')
    // The highest picked level, as words the AI prompts and source queries read.
    expect(patch.seniority).toBe('Mid-level')
  })

  it('falls back to "any" work mode and no seniority for unknown or missing values', () => {
    const patch = searchPrefsPatch(fd([['remotePref', 'moon']]), null)
    expect(patch.remotePref).toBe('any')
    expect(patch.seniority).toBeNull()
  })

  it('keeps cities and priority of countries the user already had', () => {
    const merged = mergeLocationPrefs([{ country: 'IN', region: 'Kerala', cities: ['Kochi'], priority: 1 }, { country: 'US' }], ['IN', 'AE'])
    expect(merged).toEqual([
      { country: 'IN', region: 'Kerala', cities: ['Kochi'], priority: 1 },
      { country: 'AE', cities: [], priority: 1 },
    ])
  })
})

const baseProfile = {
  headline: 'Backend developer',
  skills: ['PHP', 'Laravel'],
  industries: [],
  roleTypes: ['backend'],
  seniority: null,
  seniorityLevels: ['junior', 'mid'],
  yearsExperience: 1,
  remotePref: 'any',
  remoteScope: 'worldwide',
  locationPrefs: [{ country: 'AE' }, { country: 'IN' }],
  acceptRelocation: false,
  willingToRelocateTo: [],
  stackWeights: {},
  mustHaves: [],
  dealbreakers: [],
  keywords: [],
  benefitPrefs: {},
  discoveryPrefs: { noticePeriods: ['immediate', '1_month'] },
  searchPrefsSavedAt: new Date(),
} as unknown as UserProfile

const j = (title: string, over: Partial<NormalizedJob> = {}): NormalizedJob => ({
  kind: 'job',
  title,
  companyName: 'Acme',
  location: 'Dubai',
  remoteType: 'onsite',
  descriptionMd: 'Laravel APIs',
  applyUrl: 'https://acme.example/1',
  techStack: [],
  raw: {},
  ...over,
})

const raw = {
  match_score: 80,
  strengths: [],
  red_flags: [],
  reasoning: 'x',
  location_match: 'priority_1' as const,
  seniority_match: 'match' as const,
  stack_overlap: [],
  stack_gaps: [],
  industry_match: 'weak' as const,
}

describe('match scoring with preferences', () => {
  it('puts target roles, seniority, regions and the master-CV digest in the v1.1 prompt', () => {
    expect(SCORE_JOB_PROMPT_VERSION).toBe('1.1.0')
    const prompt = buildScoreJobPrompt(j('Laravel Developer'), baseProfile, { cvDigest: 'CV role: Software Engineer' })
    expect(prompt).toContain('"target_roles": [\n    "Backend"')
    expect(prompt).toContain('"target_seniority": [\n    "Junior",\n    "Mid-level"')
    expect(prompt).toContain('"target_regions": [\n    "UAE",\n    "India"')
    expect(prompt).toContain('--- MASTER CV DIGEST ---\nCV role: Software Engineer')
  })

  it('caps a seniority mismatch and prefers the selected regions', () => {
    // A Senior title is a soft stretch now: capped, not dropped to the filtered cap.
    expect(applyCaps(raw, j('Senior Laravel Developer'), baseProfile)).toBe(PREFERENCE_CAPS.seniorityStretchStrong)
    expect(applyCaps(raw, j('Senior Go Developer', { descriptionMd: 'Go services' }), baseProfile)).toBe(PREFERENCE_CAPS.seniorityStretch)
    expect(applyCaps(raw, j('Director of Engineering'), baseProfile)).toBe(PREFERENCE_CAPS.seniority)
    expect(applyCaps(raw, j('Laravel Developer'), baseProfile)).toBe(80 + PREFERENCE_CAPS.regionBonus)
    expect(applyCaps(raw, j('Laravel Developer', { location: 'Berlin, Germany' }), baseProfile)).toBe(PREFERENCE_CAPS.location)
    expect(applyCaps(raw, j('Frontend Engineer'), baseProfile)).toBe(PREFERENCE_CAPS.role)
    // Inactive preferences: the AI score stands.
    expect(applyCaps(raw, j('Senior Laravel Developer'), { ...baseProfile, searchPrefsSavedAt: null })).toBe(80)
  })

  it('boosts GCC e-invoicing postings for a profile with that evidence', () => {
    const p = { ...baseProfile, skills: ['PHP', 'ZATCA', 'VAT'] } as UserProfile
    const posting = j('Laravel Developer', { location: 'Dubai', descriptionMd: 'ZATCA e-invoicing integration' })
    expect(applyCaps(raw, posting, p)).toBe(80 + PREFERENCE_CAPS.regionBonus + PREFERENCE_CAPS.einvoicingBonus)
  })
})

describe('views', () => {
  it('summarises what the user is looking for', () => {
    expect(lookingForView(baseProfile)).toMatchObject({
      active: true,
      roles: ['Backend'],
      seniority: ['Junior', 'Mid-level'],
      regions: ['UAE', 'India'],
      remote: 'Remote worldwide (workable from home)',
      notice: 'Immediate or 1 month',
    })
  })

  it('pre-ticks the Gulf and India before the first save', () => {
    const v = searchPrefsFormValues({ ...baseProfile, searchPrefsSavedAt: null, locationPrefs: [] } as unknown as UserProfile)
    // Region-taxonomy ids: the GCC group and India (each includes every place below it).
    expect(v.regions).toEqual(['gcc', 'in'])
    expect(v.saved).toBe(false)
  })
})
