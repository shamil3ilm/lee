import { describe, expect, it } from 'vitest'
import { parseCommentHeader } from '@/lib/discovery/adapters/hn-whoishiring'
import { cappedFit, fitText } from '@/lib/discovery/match/blend'
import { withImplied } from '@/lib/discovery/match/lexicon'
import { CEILINGS, computeMatch } from '@/lib/discovery/match/score'
import type { MatchDetail, MatchJob, MatchProfile } from '@/lib/discovery/match/types'
import { evaluateRelevance } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { REGION_CODES } from '@/lib/discovery/relevance/places'
import { matchJob, matchProfile } from './discovery-match-helpers'

/**
 * "How is this 72?" — a Senior Frontend role, remote only for residents of
 * four SE Asian countries, for a junior–mid backend (Laravel, payments)
 * profile based in India and targeting the GCC and India. It must land in
 * the weak band with the reason, whatever the AI says; genuinely good
 * remote and GCC jobs must stay high. Synthetic text, no real employer.
 */

const SEA_FRONTEND = `OpenRail | Senior Frontend Developer | Indonesia, Philippines, Thailand or Vietnam | Full-Time | REMOTE

OpenRail builds open banking APIs and payment infrastructure for banks and lenders across Southeast Asia: real-time disbursements, bank-transfer payments and reconciliation.

What you'll do:
- Own our customer dashboard in React and TypeScript
- Build reusable UI components and a design system
- Work with the API team on screens for payments and account data
- Improve web performance and accessibility

Requirements:
- 5+ years of frontend development
- Strong React, TypeScript, HTML and CSS
- State management (Redux or similar) and testing (Jest)
- You must be based in Indonesia, the Philippines, Thailand or Vietnam`

function hnJob(text: string): MatchJob {
  const h = parseCommentHeader(text)!
  return matchJob({ title: h.role, location: h.location, remoteType: h.remoteType, descriptionMd: text })
}

/** Junior–mid backend, payments evidence, based in India, GCC + India targets (UAE and Kuwait starred). */
function backendProfile(over: Partial<MatchProfile> = {}): MatchProfile {
  return matchProfile({
    extra: {
      basedIn: 'IN',
      sponsorshipFor: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
      payFloors: [],
      relocationIfSponsored: true,
      relocationCountries: [],
      preferredRegions: [
        { id: 'ae', level: 'top' },
        { id: 'kw', level: 'top' },
      ],
    },
    ...over,
  })
}

const part = (d: MatchDetail, key: string) => d.components.find((c) => c.key === key)!

describe('the SE-Asia-only Senior Frontend posting (the "Fit 72" report)', () => {
  const job = hnJob(SEA_FRONTEND)
  const d = computeMatch(job, backendProfile())

  it('parses the HN header into a remote posting located in the four countries', () => {
    expect(job).toMatchObject({ title: 'Senior Frontend Developer', location: 'Indonesia, Philippines, Thailand or Vietnam', remoteType: 'remote' })
  })

  it('is capped in the weak band with the eligibility reason', () => {
    expect(d.ceiling).toEqual({ score: CEILINGS.ineligible, reason: 'Not eligible: remote only for Indonesia, Philippines, Thailand or Vietnam' })
    expect(CEILINGS.ineligible).toBeLessThanOrEqual(30)
    expect(d.score).toBeLessThanOrEqual(30)
  })

  it('scores each component low for the right reason', () => {
    expect(part(d, 'region')).toMatchObject({ points: 0 })
    expect(part(d, 'role')).toMatchObject({ points: 3, label: 'Role: Frontend (not a target)' })
    expect(part(d, 'seniority').points).toBeLessThanOrEqual(4)
    expect(part(d, 'seniority').label).not.toMatch(/strong/)
    expect(part(d, 'domain').points).toBeLessThanOrEqual(2)
    expect(part(d, 'skills').points).toBeLessThanOrEqual(10)
  })

  it('stays capped when the AI half and the growth nudge are high', () => {
    expect(cappedFit(d.score, 95, d)).toBeLessThanOrEqual(30)
    expect(fitText(d.score, 100, { ceiling: d.ceiling!.score, nudge: 5 })).toBe(`Fit ${Math.min(30, Math.round((d.score + 100) / 2))}`)
  })

  it('stays capped for a profile that also has Vue/JS ready', () => {
    const vue = backendProfile({ skills: withImplied(['laravel', 'mysql', 'rest', 'git', 'docker', 'vue', 'javascript', 'typescript', 'html', 'css']) })
    expect(computeMatch(job, vue).score).toBeLessThanOrEqual(30)
  })

  it('a working-hours window does not turn a country list into eligibility', () => {
    const withWindow = hnJob(SEA_FRONTEND.replace('Requirements:', 'Core hours GMT+7, flexible by ±3h.\n\nRequirements:'))
    const w = computeMatch(withWindow, backendProfile())
    expect(part(w, 'region').points).toBe(0)
    expect(w.ceiling?.reason).toBe('Not eligible: remote only for Indonesia, Philippines, Thailand or Vietnam')
  })
})

describe('remote eligibility vs working-hours windows', () => {
  const backendJd = '## Requirements\n- 2+ years of PHP and Laravel\n- MySQL and REST APIs\n- Payment gateway integrations'

  it('passes a backend remote role with an explicit APAC window and no residence restriction', () => {
    const job = matchJob({ location: 'Remote', remoteType: 'remote', descriptionMd: `${backendJd}\n\nWe work APAC time zones (UTC+4 to +8).` })
    const d = computeMatch(job, backendProfile())
    expect(part(d, 'region')).toMatchObject({ points: 9, label: 'Remote, hours fit your time zone' })
    expect(d.ceiling).toBeUndefined()
  })

  it('fails a remote role whose location names only countries you do not accept, window or not', () => {
    const job = matchJob({ location: 'Remote - Indonesia or Vietnam', remoteType: 'remote', descriptionMd: `${backendJd}\n\nHours: UTC+5:30 to UTC+7.` })
    const d = computeMatch(job, backendProfile())
    expect(part(d, 'region').points).toBe(0)
    expect(d.ceiling?.reason).toBe('Not eligible: remote only for Indonesia or Vietnam')
  })

  it('does not read "Southeast Asia" as covering India or the Gulf', () => {
    const job = matchJob({ location: 'Remote (Southeast Asia)', remoteType: 'remote', descriptionMd: backendJd })
    expect(part(computeMatch(job, backendProfile()), 'region').points).toBe(0)
    const user: SearchPrefs = { ...EMPTY_PREFS, active: true, roleFamilies: ['backend'], seniority: ['junior', 'mid'], regions: [...REGION_CODES], remoteScope: 'worldwide', extra: { ...EMPTY_PREFS.extra, basedIn: 'IN' } }
    expect(evaluateRelevance({ title: 'Backend Developer', location: 'Remote (Southeast Asia)', remoteType: 'remote', descriptionMd: backendJd }, user).pass).toBe(false)
    // Asia as a whole still includes India.
    expect(evaluateRelevance({ title: 'Backend Developer', location: 'Remote, Asia', remoteType: 'remote', descriptionMd: backendJd }, user).pass).toBe(true)
  })

  it('caps on-site elsewhere without relocation, never with a relocation offer you accept', () => {
    const berlin = matchJob({ title: 'Backend Developer', location: 'Berlin, Germany', remoteType: 'onsite', descriptionMd: backendJd })
    const noReloc = computeMatch(berlin, backendProfile({ extra: { ...backendProfile().extra, relocationIfSponsored: false } }))
    expect(noReloc.ceiling).toEqual({ score: CEILINGS.ineligible, reason: 'Not eligible: on-site in Berlin' })
    expect(noReloc.score).toBeLessThanOrEqual(30)
    const offered = matchJob({ ...berlin, descriptionMd: `${backendJd}\n\nWe offer a relocation package and visa sponsorship.` })
    expect(computeMatch(offered, backendProfile()).ceiling).toBeUndefined()
  })
})

describe('good jobs stay high', () => {
  const jd = `## About the role
Build and run our payment gateway integrations and REST APIs.

## Responsibilities
- Build REST APIs in Laravel for payments and payouts
- Integrate payment gateways and webhooks
- Maintain MySQL schemas and queries

## Requirements
- 2+ years of PHP and Laravel
- MySQL
- REST APIs and Git`

  it.each([
    ['remote worldwide', { title: 'Backend Developer (PHP/Laravel)', location: 'Remote - Worldwide', remoteType: 'remote' }],
    ['remote, India-eligible', { title: 'Laravel Developer', location: 'Remote, India', remoteType: 'remote' }],
    ['Dubai on-site', { title: 'Mid-level Laravel Developer', location: 'Dubai, United Arab Emirates', remoteType: 'onsite' }],
  ] as const)('%s backend payments role scores 70+ with no ceiling', (_name, over) => {
    const d = computeMatch(matchJob({ ...over, descriptionMd: jd }), backendProfile())
    expect(d.ceiling).toBeUndefined()
    expect(d.score).toBeGreaterThanOrEqual(70)
    expect(part(d, 'domain').points).toBe(5)
  })
})

describe('role, seniority and domain on an off-target posting', () => {
  it('reads a generic title whose JD is frontend-only as not a target for a backend profile', () => {
    const job = matchJob({
      title: 'Software Engineer',
      descriptionMd: '## Responsibilities\n- Build UI components in React and TypeScript\n- Style pages with CSS and Tailwind\n## Requirements\n- React, TypeScript, CSS, Redux, Jest',
    })
    expect(part(computeMatch(job, backendProfile()), 'role')).toMatchObject({ points: 3 })
  })

  it('keeps the generic-title 7 when the JD reads as a target family or names nothing', () => {
    expect(part(computeMatch(matchJob({ title: 'Software Engineer' }), backendProfile()), 'role').points).toBe(7)
  })

  it('gives a fintech company only a small domain bonus when the role is not one you target', () => {
    const d = computeMatch(hnJob(SEA_FRONTEND), backendProfile())
    expect(part(d, 'domain')).toMatchObject({ points: 2, label: 'Domain: payments company, but the role is Frontend' })
  })

  it('drops the strength offset when the posting asks at least twice your years', () => {
    const job = matchJob({ title: 'Senior Backend Engineer', descriptionMd: '## Requirements\n- 5+ years of backend experience\n- PHP and Laravel\n- Payment gateways' })
    const s = part(computeMatch(job, backendProfile({ years: 2 })), 'seniority')
    expect(s.points).toBeLessThanOrEqual(4)
    expect(s.label).not.toMatch(/strong/)
    // A smaller stretch (3 years for 4+) still gets the strong-area offset.
    const near = matchJob({ title: 'Senior Backend Engineer', descriptionMd: '## Requirements\n- 4+ years of backend experience\n- PHP and Laravel\n- Payment gateways' })
    expect(part(computeMatch(near, backendProfile({ years: 3 })), 'seniority').label).toMatch(/strong/)
  })
})
