import { describe, expect, it } from 'vitest'
import type { UserProfile } from '@/lib/db/queries/profile'
import { blendScores, scoreBand, scoreText } from '@/lib/discovery/match/blend'
import { matchKey } from '@/lib/discovery/match/key'
import { matchProfileFrom, resumeYears } from '@/lib/discovery/match/profile'
import { computeMatch } from '@/lib/discovery/match/score'
import { MATCH_COMPONENT_KEYS } from '@/lib/discovery/match/types'
import { MATCH_SCORE_VERSION } from '@/lib/discovery/match/version'
import { readResumeProfile } from '@/lib/resume/types'
import { matchJob, matchProfile } from './discovery-match-helpers'

const NOW = new Date('2026-10-08T00:00:00Z')

/** A synthetic résumé: one ready role, one AI-assisted project still being learned. */
const RESUME = {
  basics: { name: 'Sample Person' },
  work: [
    {
      id: 'w1',
      name: 'Example Payments Co',
      position: 'Backend Developer',
      startDate: '2023-01',
      endDate: '',
      keywords: ['Laravel', 'MySQL'],
      highlights: [{ id: 'h1', text: 'Built payment gateway webhooks in Laravel', depth: 'own' }],
    },
  ],
  projects: [
    {
      id: 'p1',
      name: 'Cluster lab',
      description: 'Kubernetes operator',
      keywords: ['Kubernetes', 'Go'],
      depth: 'learning',
    },
  ],
  skills: [
    {
      id: 'g1',
      name: 'Skills',
      skills: [
        { id: 's1', name: 'PHP', depth: 'own' },
        { id: 's2', name: 'Kubernetes', depth: 'learning' },
        { id: 's3', name: 'ZATCA e-invoicing', kind: 'domain', depth: 'ai_assisted', domainReady: true },
      ],
    },
  ],
  languages: [{ id: 'l1', language: 'Arabic', fluency: 'basic' }],
}

function profileRow(over: Partial<UserProfile> = {}): UserProfile {
  return {
    skills: [],
    stackWeights: {},
    yearsExperience: null,
    remotePref: 'any',
    resume: RESUME,
    roleTypes: ['backend'],
    seniorityLevels: ['junior', 'mid'],
    locationPrefs: [{ country: 'AE' }, { country: 'SA' }],
    acceptRelocation: false,
    willingToRelocateTo: [],
    remoteScope: 'worldwide',
    keywords: [],
    dealbreakers: [],
    searchPrefsSavedAt: NOW,
    discoveryPrefs: { basedIn: 'IN', sponsorshipFor: ['AE', 'SA'] },
    ...over,
  } as unknown as UserProfile
}

describe('matchProfileFrom (ready evidence only)', () => {
  const p = matchProfileFrom(profileRow(), NOW)

  it('counts ready skills and ready work, never learning items', () => {
    expect(p.skills.has('laravel')).toBe(true)
    expect(p.skills.has('php')).toBe(true)
    expect(p.skills.has('mysql')).toBe(true)
    expect(p.skills.has('kubernetes')).toBe(false)
    expect(p.skills.has('go')).toBe(false)
  })

  it('takes domains from ready and domain-ready evidence', () => {
    expect([...p.domains].sort()).toEqual(['einvoicing', 'payments'])
  })

  it('reads years from dated roles, languages and preferences', () => {
    expect(p.years).toBe(3)
    expect(p.languages.get('arabic')).toBe('basic')
    expect(p.regions).toEqual(['AE', 'SA'])
    expect(p.extra.sponsorshipFor).toEqual(['AE', 'SA'])
  })

  it('prefers the explicit years setting and falls back to legacy skills without a résumé', () => {
    const legacy = matchProfileFrom(profileRow({ resume: null, skills: ['Laravel', 'Postgres'], yearsExperience: 1 }), NOW)
    expect([...legacy.skills]).toEqual(expect.arrayContaining(['laravel', 'php', 'postgresql']))
    expect(legacy.years).toBe(1)
  })

  it('computes whole years with overlaps merged', () => {
    expect(resumeYears(readResumeProfile(RESUME), NOW)).toBe(3)
    expect(resumeYears(null, NOW)).toBeNull()
  })
})

describe('computeMatch', () => {
  it('returns every component, in order, summing to the clamped score', () => {
    const d = computeMatch(matchJob(), matchProfile())
    expect(d.v).toBe(MATCH_SCORE_VERSION)
    expect(d.components.map((c) => c.key)).toEqual([...MATCH_COMPONENT_KEYS])
    expect(d.score).toBe(Math.max(0, Math.min(100, d.components.reduce((s, c) => s + c.points, 0))))
  })

  it('scores a strong GCC Laravel posting high and a mismatched one low', () => {
    const strong = computeMatch(
      matchJob({
        title: 'Laravel Developer',
        location: 'Riyadh, Saudi Arabia',
        descriptionMd: '## Requirements\n- 2+ years of PHP and Laravel\n- MySQL, REST APIs, Git\nVisa provided. Payment gateway integrations.',
      }),
      matchProfile(),
    )
    expect(strong.score).toBeGreaterThanOrEqual(85)
    expect(strong.missing).toEqual([])
    const weak = computeMatch(
      matchJob({
        title: 'Senior Site Reliability Engineer',
        location: 'Berlin, Germany',
        descriptionMd: '## Requirements\n- 8+ years\n- Kubernetes, Terraform, Go\nFluent German required.',
      }),
      matchProfile(),
    )
    expect(weak.score).toBeLessThan(20)
    expect(weak.missing).toEqual(expect.arrayContaining(['Kubernetes (required)', 'German fluency (required)']))
  })
})

describe('blend and bands', () => {
  it('uses the Match score alone, the AI alone, or their mean', () => {
    expect(blendScores(72, null)).toBe(72)
    expect(blendScores(null, 80)).toBe(80)
    expect(blendScores(72, 81)).toBe(77)
    expect(blendScores(null, null)).toBeNull()
  })

  it('labels the badge and colour band', () => {
    expect(scoreText(72, 80)).toBe('Match 72 · AI 80')
    expect(scoreText(72, null)).toBe('Match 72')
    expect(scoreText(null, null)).toBe('Not scored')
    expect([scoreBand(90), scoreBand(60), scoreBand(40), scoreBand(10)]).toEqual(['strong', 'good', 'fair', 'weak'])
  })
})

describe('matchKey', () => {
  it('is stable for the same inputs and changes with the evidence or preferences', () => {
    const a = matchKey(matchProfile())
    expect(matchKey(matchProfile())).toBe(a)
    expect(a.startsWith(`${MATCH_SCORE_VERSION}:`)).toBe(true)
    expect(matchKey(matchProfile({ years: 5 }))).not.toBe(a)
    expect(matchKey(matchProfile({ skills: new Set(['php']) }))).not.toBe(a)
  })
})
