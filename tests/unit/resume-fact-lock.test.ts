import { describe, expect, it } from 'vitest'
import { checkFactLock, extractNumbers } from '@/lib/resume/fact-lock'
import { addWording, effectiveWording } from '@/lib/resume/wordings'
import type { Highlight } from '@/lib/resume/types'
import { hl } from '@/tests/fixtures/resume/profile'

const MASTER =
  'Built an idempotent payouts API handling 2M+ requests a day at 99.99% availability across 3 regions in 2023.'

describe('extractNumbers', () => {
  it('finds integers, decimals, percents, separators and suffixes', () => {
    expect(extractNumbers('Cut latency by 40% for 1,200 users in 3.5 weeks; $2M saved; 10k RPS')).toEqual([
      '40',
      '1200',
      '3.5',
      '2m',
      '10k',
    ])
  })

  it('reads spelled-out numbers as digits', () => {
    expect(extractNumbers('Led three teams and twelve engineers')).toEqual(['3', '12'])
  })

  it('treats 24/7 and ranges as separate numbers', () => {
    expect(extractNumbers('24/7 on-call, 5-10 services')).toEqual(['24', '7', '5', '10'])
  })

  it('returns nothing for plain text', () => {
    expect(extractNumbers('Owned the ledger migration')).toEqual([])
  })
})

describe('checkFactLock', () => {
  it('passes when every number in the wording is in the master text', () => {
    expect(checkFactLock('Payouts API: 2M+ requests/day, 99.99% uptime', MASTER)).toEqual({ ok: true, missing: [] })
  })

  it('passes a wording with no numbers', () => {
    expect(checkFactLock('Designed an idempotent payouts API', MASTER).ok).toBe(true)
  })

  it('rejects a wording that changes or invents a number', () => {
    expect(checkFactLock('Payouts API handling 3M requests a day', MASTER)).toEqual({ ok: false, missing: ['3m'] })
    expect(checkFactLock('Saved 40% in costs', MASTER)).toEqual({ ok: false, missing: ['40'] })
  })

  it('matches a spelled-out number against its digits and back', () => {
    expect(checkFactLock('Ran it across three regions', MASTER).ok).toBe(true)
    expect(checkFactLock('Mentored 4 engineers', 'Mentored four engineers').ok).toBe(true)
  })

  it('ignores thousands separators but not magnitude suffixes', () => {
    expect(checkFactLock('Served 1200 users', 'Served 1,200 users').ok).toBe(true)
    expect(checkFactLock('Served 1.2k users', 'Served 1,200 users').ok).toBe(false)
  })
})

describe('wordings', () => {
  const highlight: Highlight = hl('h1', MASTER)

  it('adds a fact-locked wording immutably', () => {
    const r = addWording(highlight, 'Payouts API at 2M+ requests/day', 'user', () => 'w1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.highlight.alternates).toEqual([{ id: 'w1', text: 'Payouts API at 2M+ requests/day', source: 'user' }])
    expect(highlight.alternates).toEqual([])
  })

  it('refuses a wording with a number the master highlight lacks', () => {
    const r = addWording(highlight, 'Payouts API at 5M requests/day', 'ai', () => 'w2')
    expect(r).toEqual({ ok: false, error: 'Numbers not in the original: 5m' })
  })

  it('falls back to the master text when a stored wording no longer passes', () => {
    const edited: Highlight = {
      ...highlight,
      text: 'Built an idempotent payouts API handling 1M requests a day.',
      alternates: [{ id: 'w1', text: 'Payouts API at 2M+ requests/day', source: 'user' }],
    }
    expect(effectiveWording(edited, 'w1')).toEqual({ text: edited.text, wordingId: null, stale: true })
    expect(effectiveWording(edited, null)).toEqual({ text: edited.text, wordingId: null, stale: false })
  })

  it('uses a valid chosen wording', () => {
    const h: Highlight = { ...highlight, alternates: [{ id: 'w1', text: 'Payouts API, 99.99% available', source: 'ai' }] }
    expect(effectiveWording(h, 'w1')).toEqual({ text: 'Payouts API, 99.99% available', wordingId: 'w1', stale: false })
  })
})
