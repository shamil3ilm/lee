import { describe, expect, it } from 'vitest'
import { evaluateRelevance, type GateInput } from '@/lib/discovery/relevance/gate'
import { EMPTY_PREFS, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { REGION_CODES } from '@/lib/discovery/relevance/places'
import { offsetsIn, relocationOffered, usHoursOnly, windowFits } from '@/lib/discovery/relevance/remote'
import { seniorityOutcome } from '@/lib/discovery/relevance/seniority-rule'
import { UNCLEAR_REMOTE } from '@/lib/discovery/relevance/location-rule'

/** A generic India-based user targeting the GCC and India (synthetic). */
const USER: SearchPrefs = {
  ...EMPTY_PREFS,
  active: true,
  roleFamilies: ['backend'],
  seniority: ['junior', 'mid'],
  regions: [...REGION_CODES],
  remoteScope: 'worldwide',
  extra: { ...EMPTY_PREFS.extra, basedIn: 'IN' },
}

const remote = (location: string, descriptionMd = ''): GateInput => ({
  title: 'Backend Developer',
  location,
  remoteType: 'remote',
  descriptionMd,
})

describe('remote: can I do it from home in India?', () => {
  it.each([
    ['Remote - Worldwide', ''],
    ['Anywhere', ''],
    ['Remote (Global)', ''],
    ['Remote - APAC', ''],
    ['Remote, Asia', ''],
    ['Remote - EMEA', ''],
    ['Remote - India', ''],
    ['Remote', 'Must be based in India.'],
    ['Remote', 'Working hours UTC+5:30, IST-compatible.'],
    ['Remote', 'Core hours between UTC+2 and UTC+8.'],
    ['Remote', 'We hire through an employer of record and work from anywhere.'],
  ])('passes %s / %s', (location, description) => {
    const r = evaluateRelevance(remote(location, description), USER)
    expect(r.pass, `${location} ${description}`).toBe(true)
    expect(r.penalties).not.toContain(UNCLEAR_REMOTE)
  })

  it.each([
    ['Remote - US', '', 'location: US-only'],
    ['Remote (US only)', '', 'location: US-only'],
    ['Remote', 'Candidates must reside in the EU.', 'location: Europe-only'],
    ['Remote', 'You must have the right to work in the UK.', 'location: UK-only'],
    ['Remote - Canada only', '', 'location: Canada-only'],
    ['Remote', 'You must work US time zones only.', 'location: US time zones only'],
    ['Remote', 'Working hours UTC-8 to UTC-5.', 'location: working hours far from your time zone'],
  ])('filters %s / %s with the reason', (location, description, reason) => {
    const r = evaluateRelevance(remote(location, description), USER)
    expect(r.pass).toBe(false)
    expect(r.reasons).toEqual([reason])
  })

  it('gives an ambiguous "Remote" a soft "unclear eligibility" chip', () => {
    const r = evaluateRelevance(remote('Remote'), USER)
    expect(r.pass).toBe(true)
    expect(r.penalties).toEqual([UNCLEAR_REMOTE])
    expect(r.rankAdjust).toBeLessThan(0)
  })

  it('keeps the contract-only hard filter for worldwide contractor roles', () => {
    const r = evaluateRelevance({ ...remote('Worldwide'), employmentType: 'contract' }, USER)
    expect(r.pass).toBe(false)
    expect(r.reasons[0]).toMatch(/^contract/)
  })

  it('reads UTC offsets and US-hours wording', () => {
    expect(offsetsIn('UTC+5:30 or GMT-3')).toEqual([5.5, -3])
    expect(windowFits('UTC+1', 5.5)).toBe(false)
    expect(windowFits('UTC+2', 5.5)).toBe(true)
    expect(windowFits('no window', 5.5)).toBeNull()
    expect(usHoursOnly('PST hours required')).toBe(true)
    expect(usHoursOnly('US time zones only, but flexible hours for the rest')).toBe(false)
  })
})

describe('relocation granted, any country', () => {
  const onsite = (location: string, descriptionMd: string): GateInput => ({ title: 'Backend Developer', location, remoteType: 'onsite', descriptionMd })

  it.each([
    ['Berlin, Germany', 'We offer a relocation package.', 'Relocation offered · Berlin'],
    ['Amsterdam, Netherlands', 'Visa sponsorship available.', 'Relocation offered · Amsterdam'],
    ['London, UK', 'Skilled Worker visa sponsorship provided.', 'Relocation offered · UK'],
    ['Munich, Germany', 'EU Blue Card sponsorship and relocation assistance.', 'Relocation offered · Munich'],
    ['Toronto, Canada', 'We sponsor visas for the right candidate.', 'Relocation offered · Canada'],
  ])('passes %s when it offers relocation (%s)', (location, text, boost) => {
    const r = evaluateRelevance(onsite(location, text), USER)
    expect(r.pass).toBe(true)
    expect(r.boosts).toContain(boost)
  })

  it('keeps a posting without a relocation offer, or with a negated one, filtered by region', () => {
    expect(evaluateRelevance(onsite('Berlin, Germany', 'Great team.'), USER).reasons).toEqual(['location: Berlin'])
    expect(evaluateRelevance(onsite('Berlin, Germany', 'We are unable to sponsor visas or relocation.'), USER).pass).toBe(false)
    expect(relocationOffered('No visa sponsorship available.')).toBe(false)
  })

  it('honours the toggle and the country list', () => {
    const off: SearchPrefs = { ...USER, extra: { ...USER.extra, relocationIfSponsored: false } }
    expect(evaluateRelevance(onsite('Berlin, Germany', 'Relocation package.'), off).pass).toBe(false)
    const onlyCanada: SearchPrefs = { ...USER, extra: { ...USER.extra, relocationCountries: ['CA'] } }
    expect(evaluateRelevance(onsite('Berlin, Germany', 'Relocation package.'), onlyCanada).pass).toBe(false)
    const eu: SearchPrefs = { ...USER, extra: { ...USER.extra, relocationCountries: ['DE'] } }
    expect(evaluateRelevance(onsite('Berlin, Germany', 'Relocation package.'), eu).pass).toBe(true)
  })
})

describe('seniority: soft and evidence-based', () => {
  const base = { mode: 'soft' as const, selected: ['junior', 'mid'] as const, architect: false, strength: null }

  it('ranks Senior / Lead / Staff titles lower, never filters them', () => {
    expect(seniorityOutcome({ ...base, selected: [...base.selected], title: 'senior', years: null })).toEqual({
      hard: null,
      penalty: { label: 'Senior title', points: -10 },
    })
    expect(seniorityOutcome({ ...base, selected: [...base.selected], title: 'lead', years: null }).hard).toBeNull()
  })

  it('weights years asked: 3+ light for a junior target, 5+ strong', () => {
    expect(seniorityOutcome({ ...base, selected: ['junior'], title: null, years: 3 }).penalty).toEqual({ label: '3+ yrs asked', points: -3 })
    expect(seniorityOutcome({ ...base, selected: [...base.selected], title: null, years: 5 }).penalty).toEqual({ label: '5+ yrs asked', points: -10 })
  })

  it('halves the penalty for a strong ready match and says so', () => {
    const r = seniorityOutcome({ ...base, selected: [...base.selected], title: 'senior', years: 5, strength: 'payments' })
    expect(r.penalty).toEqual({ label: 'Senior title · 5+ yrs asked · strong payments match', points: -10 })
  })

  it('still filters Principal, Director, Head of, VP and a 10+ yr Architect', () => {
    for (const title of ['principal', 'director', 'head', 'executive'] as const) {
      expect(seniorityOutcome({ ...base, selected: [...base.selected], title, years: null }).hard).toMatch(/^seniority: /)
    }
    expect(seniorityOutcome({ ...base, selected: [...base.selected], title: null, years: 12, architect: true }).hard).toBe(
      'seniority: Architect, 10+ years',
    )
  })

  it('shows the combined chip in the gate', () => {
    const prefs: SearchPrefs = { ...USER, strengths: ['payments'] }
    const r = evaluateRelevance(
      { title: 'Senior Backend Engineer, Payments', location: 'Dubai', remoteType: 'onsite', descriptionMd: '5+ years of experience with payment gateways.' },
      prefs,
    )
    expect(r.pass).toBe(true)
    expect(r.penalties).toEqual(['Senior title · 5+ yrs asked · strong payments match'])
  })
})
