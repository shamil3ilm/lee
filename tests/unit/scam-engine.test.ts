import { describe, expect, it } from 'vitest'
import {
  assessScam,
  levelFor,
  lookupCandidates,
  maxLevel,
  mergeSecondOpinion,
  scoreSignals,
} from '@/lib/scam/engine'
import { isNegated, renderSalary, spansAreVerbatim, toFields } from '@/lib/scam/text'
import type { NetContext, ScamInput, ScamSignal } from '@/lib/scam/types'
import { CAUTION_AT, LIKELY_SCAM_AT, RULES_VERSION } from '@/lib/scam/version'

function sig(weight: number): ScamSignal {
  return { id: `x${weight}`, group: 'content', weight, label: '', evidence: [] }
}

describe('scoring + thresholds', () => {
  it('sums weights and caps at 100', () => {
    expect(scoreSignals([])).toBe(0)
    expect(scoreSignals([sig(15), sig(30)])).toBe(45)
    expect(scoreSignals([sig(45), sig(45), sig(45)])).toBe(100)
  })

  it('maps scores to levels at the documented thresholds', () => {
    expect(CAUTION_AT).toBe(25)
    expect(LIKELY_SCAM_AT).toBe(55)
    expect(levelFor(0)).toBe('safe')
    expect(levelFor(24)).toBe('safe')
    expect(levelFor(25)).toBe('caution')
    expect(levelFor(54)).toBe('caution')
    expect(levelFor(55)).toBe('likely_scam')
    expect(levelFor(100)).toBe('likely_scam')
  })

  it('a second opinion can only raise the level', () => {
    expect(maxLevel('safe', 'caution')).toBe('caution')
    expect(mergeSecondOpinion('likely_scam', 'safe')).toBe('likely_scam')
    expect(mergeSecondOpinion('caution', 'safe')).toBe('caution')
    expect(mergeSecondOpinion('safe', 'likely_scam')).toBe('likely_scam')
    expect(mergeSecondOpinion('caution', null)).toBe('caution')
  })
})

describe('assessScam', () => {
  const scam: ScamInput = {
    title: 'Work From Home - Data Entry',
    company: 'Amazon',
    description:
      'Congratulations, you have been selected! No experience needed, work from home and earn ₹3000 per day. ' +
      'Pay a refundable registration fee of Rs. 999. Contact HR on WhatsApp +91 90000 00000.',
    applyEmail: 'amazon.hiring.desk@gmail.com',
  }

  it('flags a classic Indian fee scam as likely_scam with verbatim evidence', () => {
    const res = assessScam(scam)
    expect(res.level).toBe('likely_scam')
    expect(res.score).toBe(100)
    expect(res.rulesVersion).toBe(RULES_VERSION)
    const fields = toFields(scam)
    for (const s of res.signals) {
      expect(s.evidence.length).toBeGreaterThan(0)
      expect(spansAreVerbatim(fields, s.evidence)).toBe(true)
    }
  })

  it('is deterministic', () => {
    expect(assessScam(scam)).toEqual(assessScam(scam))
  })

  it('rates an ordinary posting safe', () => {
    const res = assessScam({
      title: 'Senior Backend Engineer',
      company: 'Acme',
      companyDomain: 'acme.com',
      description:
        'You will design and operate our payments APIs in Go and Postgres. 5+ years of experience. ' +
        'Interview: recruiter call, system design, team chat.',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/123',
      salary: { min: 150000, max: 190000, currency: 'USD' },
      location: 'Remote (US)',
    })
    expect(res.level).toBe('safe')
    expect(res.signals).toEqual([])
    expect(res.score).toBe(0)
  })

  it('handles empty input', () => {
    expect(assessScam({})).toMatchObject({ score: 0, level: 'safe', signals: [] })
  })
})

describe('net facts', () => {
  const input: ScamInput = {
    company: 'Brightpath Global',
    companyDomain: 'brightpath-global.com',
    applyEmail: 'hr@brightpath-global.com',
    description: 'Operations executive.',
  }

  it('picks lookup candidates, skipping free-mail, ATS and known brands', () => {
    expect(lookupCandidates(input)).toEqual({
      domains: ['brightpath-global.com'],
      mailDomains: ['brightpath-global.com'],
    })
    expect(
      lookupCandidates({
        company: 'Amazon',
        applyUrl: 'https://amazon.jobs/x',
        applyEmail: 'x@gmail.com',
        url: 'https://www.linkedin.com/jobs/1',
      }),
    ).toEqual({ domains: [], mailDomains: [] })
  })

  it('young domain and missing MX add risk with the domain as evidence', () => {
    const net: NetContext = {
      domains: [{ domain: 'brightpath-global.com', registeredAt: '2026-09-01', ageDays: 25, hasMx: false }],
      mailDomains: ['brightpath-global.com'],
    }
    const res = assessScam(input, net)
    const got = res.signals.map((s) => s.id)
    expect(got).toContain('sender.young_domain')
    expect(got).toContain('sender.no_mx')
    expect(res.score).toBe(50)
    const fields = toFields(input)
    for (const s of res.signals) expect(spansAreVerbatim(fields, s.evidence)).toBe(true)
  })

  it('unknown facts never raise risk', () => {
    const net: NetContext = {
      domains: [{ domain: 'brightpath-global.com', registeredAt: null, ageDays: null, hasMx: null }],
      mailDomains: ['brightpath-global.com'],
    }
    expect(assessScam(input, net).score).toBe(assessScam(input).score)
  })

  it('old domain with MX adds nothing', () => {
    const net: NetContext = {
      domains: [{ domain: 'brightpath-global.com', registeredAt: '2010-01-01', ageDays: 6000, hasMx: true }],
      mailDomains: ['brightpath-global.com'],
    }
    expect(assessScam(input, net).signals).toEqual([])
  })
})

describe('text helpers', () => {
  it('renders structured salary', () => {
    expect(renderSalary({ min: 10, max: 20, currency: 'INR' })).toBe('INR 10-20')
    expect(renderSalary({ max: 20 })).toBe('20')
    expect(renderSalary(null)).toBe('')
  })

  it('detects negation within the same clause only', () => {
    const t = 'No experience needed. Pay the registration fee today.'
    const i = t.indexOf('registration fee')
    expect(isNegated(t, i, i + 'registration fee'.length)).toBe(false)
    const n = 'We never ask for a registration fee.'
    const j = n.indexOf('registration fee')
    expect(isNegated(n, j, j + 'registration fee'.length)).toBe(true)
  })
})
