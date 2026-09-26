import { describe, expect, it } from 'vitest'
import { allowListEntriesFor, matchesAllowList } from '@/lib/scam/allow-list'
import { assessScam } from '@/lib/scam/engine'
import type { ScamInput } from '@/lib/scam/types'

describe('allow-list', () => {
  it('remembers own domains and the normalized company, skipping free-mail and ATS', () => {
    expect(
      allowListEntriesFor({
        company: 'Brightpath Global Pvt. Ltd.',
        companyDomain: 'https://www.brightpath-global.com',
        applyUrl: 'https://boards.greenhouse.io/bp/1',
        applyEmail: 'hr@gmail.com',
      }),
    ).toEqual([
      { kind: 'domain', value: 'brightpath-global.com' },
      { kind: 'company', value: 'brightpath global' },
    ])
  })

  it('matches by domain or by company name', () => {
    const input: ScamInput = { company: 'Brightpath Global', applyUrl: 'https://careers.brightpath-global.com/x' }
    const signals = assessScam(input).signals
    expect(matchesAllowList(input, signals, [{ kind: 'domain', value: 'brightpath-global.com' }])).toBe(true)
    expect(matchesAllowList(input, signals, [{ kind: 'company', value: 'brightpath global' }])).toBe(true)
    expect(matchesAllowList(input, signals, [{ kind: 'company', value: 'other co' }])).toBe(false)
    expect(matchesAllowList(input, signals, [])).toBe(false)
  })

  it('an allow-listed company name cannot be borrowed by an impersonator', () => {
    const entries = [
      { kind: 'company', value: 'amazon' },
      { kind: 'domain', value: 'amazon.jobs' },
    ] as const
    const freemail: ScamInput = { company: 'Amazon', applyEmail: 'amazon.jobs.hr@gmail.com', companyDomain: 'amazon.jobs' }
    expect(matchesAllowList(freemail, assessScam(freemail).signals, entries)).toBe(false)
    const lookalike: ScamInput = { company: 'Amazon', applyUrl: 'https://amazon-careers.com/apply' }
    expect(matchesAllowList(lookalike, assessScam(lookalike).signals, entries)).toBe(false)
    const real: ScamInput = { company: 'Amazon', applyUrl: 'https://www.amazon.jobs/en/jobs/1' }
    expect(matchesAllowList(real, assessScam(real).signals, entries)).toBe(true)
  })
})
