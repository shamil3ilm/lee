import { describe, expect, it, vi } from 'vitest'
import { classifyHeadline } from '@/lib/reputation/classify'
import { isoDay, mentionsCompany, onCompanyDomain, signalId, truncate } from '@/lib/reputation/match'
import { createHostLimiter } from '@/lib/reputation/rate-limit'
import { errorText, REPUTATION_USER_AGENT, requestJson, SourceHttpError } from '@/lib/reputation/http'
import { NO_WAIT } from '@/lib/reputation/rate-limit'

describe('mentionsCompany', () => {
  it('matches the normalised name on word boundaries', () => {
    expect(mentionsCompany('Acme lays off 200 staff', 'Acme Inc.')).toBe(true)
    expect(mentionsCompany('ACME raises $10M', 'acme')).toBe(true)
    expect(mentionsCompany('Acmeville council meets', 'Acme')).toBe(false)
    expect(mentionsCompany('', 'Acme')).toBe(false)
    expect(mentionsCompany('Something about X', 'X')).toBe(false)
  })

  it('handles names with regex characters', () => {
    expect(mentionsCompany('News about C++ Labs today', 'C++ Labs')).toBe(true)
  })
})

describe('helpers', () => {
  it('onCompanyDomain compares registrable domains', () => {
    expect(onCompanyDomain('https://blog.acme.com/post', 'acme.com')).toBe(true)
    expect(onCompanyDomain('https://acme.com.evil.io/x', 'acme.com')).toBe(false)
    expect(onCompanyDomain('https://x.com', null)).toBe(false)
  })

  it('signalId is stable and short', () => {
    const a = signalId('gdelt', 'https://n.com/a')
    expect(a).toBe(signalId('gdelt', 'https://n.com/a'))
    expect(a).not.toBe(signalId('hn', 'https://n.com/a'))
    expect(a).toMatch(/^gdelt-[0-9a-f]{10}$/)
  })

  it('isoDay accepts ISO strings and epoch seconds', () => {
    expect(isoDay('2026-09-15T10:00:00Z')).toBe('2026-09-15')
    expect(isoDay(1_790_000_000)).toBe('2026-09-21')
    expect(isoDay('nope')).toBeNull()
    expect(isoDay(null)).toBeNull()
  })

  it('truncate collapses whitespace and caps length', () => {
    expect(truncate('a   b')).toBe('a b')
    expect(truncate('x'.repeat(300), 10)).toHaveLength(10)
  })
})

describe('classifyHeadline', () => {
  it.each([
    ['Acme workers say salaries unpaid for months — unpaid salaries protest', 'wage_theft'],
    ['Acme sued over unpaid wages', 'wage_theft'],
    ['Acme founder charged with fraud', 'fraud'],
    ['Acme workers stranded after visas cancelled', 'visa_contract'],
    ['Acme lays off 10% of staff', 'layoffs'],
    ['Acme to cut 1,200 jobs', 'layoffs'],
    ['Acme faces class action over privacy', 'lawsuit'],
    ['Acme raises $40M Series B', 'funding'],
    ['Acme opens Riyadh office', 'expansion'],
    ['Acme acquires Beta Labs', 'acquisition'],
    ['Acme shuts down its delivery business', 'closure'],
    ['Acme secures funding from regional investors', 'funding'],
    ['Acme wins design award', 'other'],
  ])('%s → %s', (title, category) => {
    expect(classifyHeadline(title)).toBe(category)
  })
})

describe('createHostLimiter', () => {
  it('spaces requests to the same host and not across hosts', async () => {
    let now = 0
    const sleeps: number[] = []
    const limiter = createHostLimiter({
      intervals: { 'a.test': 5_000 },
      clock: () => now,
      sleep: async (ms) => {
        sleeps.push(ms)
        now += ms
      },
    })
    await limiter.wait('a.test')
    await limiter.wait('a.test')
    await limiter.wait('b.test')
    expect(sleeps).toEqual([5_000])
  })
})

describe('requestJson', () => {
  it('sends the honest user agent and parses JSON', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      expect(headers['user-agent']).toBe(REPUTATION_USER_AGENT)
      return new Response('{"ok":true}', { status: 200 })
    })
    await expect(requestJson('t', 'https://a.test/x', { fetchImpl, limiter: NO_WAIT })).resolves.toEqual({ ok: true })
    expect(REPUTATION_USER_AGENT).toMatch(/^lee\/1\.0 \(\+https:\/\/getlee\.vercel\.app/)
  })

  it('throws SourceHttpError on non-2xx and a clear error on bad JSON', async () => {
    const r429 = async () => new Response('slow down', { status: 429 })
    await expect(requestJson('gdelt', 'https://a.test', { fetchImpl: r429, limiter: NO_WAIT })).rejects.toBeInstanceOf(
      SourceHttpError,
    )
    const bad = async () => new Response('Your query was too short', { status: 200 })
    await expect(requestJson('gdelt', 'https://a.test', { fetchImpl: bad, limiter: NO_WAIT })).rejects.toThrow(
      'gdelt: invalid JSON',
    )
  })

  it('errorText masks keys', () => {
    expect(errorText(new Error('failed https://x?key=SECRET&y=1'))).toBe('failed https://x?key=***&y=1')
  })
})
