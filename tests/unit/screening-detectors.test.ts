import { describe, expect, it } from 'vitest'
import {
  detectAttestation,
  detectDegreeMandatory,
  detectNoticeAsk,
  detectPresenceAsk,
  highestCredential,
  isEngineerTitle,
} from '@/lib/screening/detectors'
import { professionBan } from '@/lib/screening/profession-bans'

describe('notice / immediate joiner', () => {
  it('reads "immediate joiners" as no notice accepted', () => {
    expect(detectNoticeAsk('We need immediate joiners only.')).toMatchObject({ days: 0 })
  })

  it('reads "join within N days / weeks"', () => {
    expect(detectNoticeAsk('Candidates who can join within 15 days are preferred.')).toMatchObject({ days: 15 })
    expect(detectNoticeAsk('Able to join in 2 weeks.')).toMatchObject({ days: 14 })
  })

  it('reads a notice-period cap and keeps the strictest ask', () => {
    expect(detectNoticeAsk('Notice period up to 1 month. Immediate joiners preferred.')).toMatchObject({ days: 0 })
    expect(detectNoticeAsk('Notice period of maximum 30 days.')).toMatchObject({ days: 30 })
  })

  it('says nothing when the JD does not ask', () => {
    expect(detectNoticeAsk('Build APIs in Laravel. Great team.')).toBeNull()
  })
})

describe('presence: must already hold a visa vs in-country preferred', () => {
  it('a transferable visa / valid iqama / no sponsorship is a hard ask', () => {
    expect(detectPresenceAsk('Must hold a transferable visa.')?.kind).toBe('must_hold_visa')
    expect(detectPresenceAsk('Valid Saudi iqama required.')?.kind).toBe('must_hold_visa')
    expect(detectPresenceAsk('We do not sponsor. No visa sponsorship.')?.kind).toBe('must_hold_visa')
  })

  it('in-country preferences and visit-visa invitations are soft', () => {
    expect(detectPresenceAsk('Candidates in the UAE preferred.')?.kind).toBe('in_country')
    expect(detectPresenceAsk('Visit visa holders welcome to apply.')?.kind).toBe('in_country')
    expect(detectPresenceAsk('Immediate joiners in UAE only.')?.kind).toBe('in_country')
  })

  it('a preferred own visa is soft, but "no sponsorship" stays hard even beside a preference', () => {
    expect(detectPresenceAsk('Candidates must be based in the UAE. Own visa preferred.')?.kind).toBe('in_country')
    expect(detectPresenceAsk('Own visa preferred.')?.kind).toBe('in_country')
    expect(detectPresenceAsk('No visa sponsorship; local candidates preferred.')?.kind).toBe('must_hold_visa')
  })

  it('a negated transferable-visa line and a plain ad are not asks', () => {
    expect(detectPresenceAsk('A transferable visa is not required; we provide one.')).toBeNull()
    expect(detectPresenceAsk('No NOC required. Visa provided.')).toBeNull()
    expect(detectPresenceAsk('Build payments in PHP.')).toBeNull()
  })
})

describe('degree mandatory and attestation', () => {
  it('a mandatory BE/BTech is a bachelor knockout ask', () => {
    expect(detectDegreeMandatory('BE/BTech in Computer Science is mandatory.')).toMatchObject({ level: 'bachelor' })
    expect(detectDegreeMandatory("Master's degree in CS required.")).toMatchObject({ level: 'master' })
  })

  it('"or equivalent" / "preferred" degrees and the word "be" are not knockouts', () => {
    expect(detectDegreeMandatory("Bachelor's degree or equivalent experience required.")).toBeNull()
    expect(detectDegreeMandatory('A degree in CS is preferred.')).toBeNull()
    expect(detectDegreeMandatory('You must be a team player and must be able to work hard.')).toBeNull()
  })

  it('reads the highest résumé credential', () => {
    expect(highestCredential(['B.Tech Computer Science College of X', 'MBA'])).toBe('master')
    expect(highestCredential(['BE Electronics Anna University'])).toBe('bachelor')
    expect(highestCredential(['AWS Certified Developer'])).toBeNull()
  })

  it('finds an attestation ask', () => {
    expect(detectAttestation('Attested degree certificates are required for the visa.')).toMatch(/attested/)
    expect(detectAttestation('Educational certificates must be attested by MOFA.')).toMatch(/attested/)
    expect(detectAttestation('Build APIs.')).toBeNull()
  })
})

describe('country profession bans and permit titles', () => {
  const now = new Date('2026-10-12T00:00:00Z')

  it('Oman bars expat programmers from 1 Jan 2026', () => {
    expect(professionBan('Software Programmer', ['OM'], now)?.state).toBe('in_force')
    expect(professionBan('PHP Developer', ['OM'], now)?.state).toBe('in_force')
    expect(professionBan('Software Programmer', ['OM'], new Date('2025-06-01T00:00:00Z'))?.state).toBe('upcoming')
  })

  it('a future ban is upcoming; other countries and titles are untouched', () => {
    expect(professionBan('Web Designer', ['OM'], now)?.state).toBe('upcoming')
    expect(professionBan('Software Programmer', ['AE'], now)).toBeNull()
    expect(professionBan('Accountant', ['OM'], now)).toBeNull()
  })

  it('a row not re-checked in a year degrades to stale (unknown, never fail)', () => {
    expect(professionBan('Software Programmer', ['OM'], new Date('2028-01-01T00:00:00Z'))?.state).toBe('stale')
  })

  it('reads engineer titles', () => {
    expect(isEngineerTitle('Software Engineer – Kuwait')).toBe(true)
    expect(isEngineerTitle('Software Developer')).toBe(false)
  })
})
