import { describe, expect, it } from 'vitest'
import { BACKOFF_BASE_MS, BACKOFF_CAP_MS, backoffMs } from '@/lib/queue/backoff'
import { MAX_ERROR_LENGTH, sanitizeError } from '@/lib/queue/errors'
import { signQueueRequest, verifyQueueRequest, SIGNATURE_MAX_SKEW_MS } from '@/lib/queue/signature'
import { jobKeys, utcDay } from '@/lib/queue/job-types'
import { stopMarginMs } from '@/lib/queue/drain'

describe('backoffMs', () => {
  it('doubles per attempt with equal jitter in [exp/2, exp]', () => {
    expect(backoffMs(1, () => 0)).toBe(BACKOFF_BASE_MS / 2)
    expect(backoffMs(1, () => 1)).toBe(BACKOFF_BASE_MS)
    expect(backoffMs(3, () => 0)).toBe((BACKOFF_BASE_MS * 4) / 2)
    expect(backoffMs(3, () => 1)).toBe(BACKOFF_BASE_MS * 4)
  })

  it('is capped', () => {
    expect(backoffMs(50, () => 1)).toBe(BACKOFF_CAP_MS)
    expect(backoffMs(50, () => 0)).toBe(BACKOFF_CAP_MS / 2)
  })

  it('jitters between calls', () => {
    const values = new Set(Array.from({ length: 20 }, () => backoffMs(4)))
    expect(values.size).toBeGreaterThan(1)
  })
})

describe('sanitizeError', () => {
  it('keeps the message, drops the stack', () => {
    const e = new Error('boom')
    expect(sanitizeError(e)).toBe('boom')
  })

  it('redacts tokens, secrets, emails and query strings', () => {
    const msg = sanitizeError(
      new Error(
        'GET https://api.example.com/v1/x?key=abc123&x=1 failed: Bearer ya29.a0AfH6SMBx for jane@corp.com token=s3cr3t ' +
          'sk_live_' + 'a'.repeat(40),
      ),
    )
    expect(msg).not.toContain('abc123')
    expect(msg).not.toContain('ya29')
    expect(msg).not.toContain('jane@corp.com')
    expect(msg).not.toContain('s3cr3t')
    expect(msg).not.toContain('a'.repeat(40))
    expect(msg).toContain('https://api.example.com/v1/x?[redacted]')
  })

  it('keeps UUIDs (row ids are not secrets)', () => {
    const id = '3f2b6c1e-8a4d-4f7b-9c2e-1d5a6b7c8d9e'
    expect(sanitizeError(`source ${id}: 500`)).toBe(`source ${id}: 500`)
  })

  it('truncates and collapses whitespace', () => {
    const msg = sanitizeError(new Error(`a\n\n  b ${'x '.repeat(400)}`))
    expect(msg.startsWith('a b x')).toBe(true)
    expect(msg.length).toBeLessThanOrEqual(MAX_ERROR_LENGTH)
  })

  it('handles non-errors', () => {
    expect(sanitizeError('plain')).toBe('plain')
    expect(sanitizeError({ weird: true })).toBe('Unknown error')
  })
})

describe('queue request signature', () => {
  const secret = 's'.repeat(40)
  const body = '{"budgetMs":1000}'
  const now = 1_800_000_000_000
  const ts = String(Math.floor(now / 1000))

  it('accepts a fresh, correct signature', () => {
    const signature = signQueueRequest(secret, ts, body)
    expect(verifyQueueRequest({ secret, timestamp: ts, signature, body, now })).toEqual({ ok: true })
  })

  it('rejects a tampered body, a wrong secret and garbage', () => {
    const signature = signQueueRequest(secret, ts, body)
    expect(verifyQueueRequest({ secret, timestamp: ts, signature, body: '{}', now }).ok).toBe(false)
    expect(
      verifyQueueRequest({ secret: 'x'.repeat(40), timestamp: ts, signature, body, now }).ok,
    ).toBe(false)
    expect(verifyQueueRequest({ secret, timestamp: ts, signature: 'zz', body, now })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('rejects missing headers and timestamps outside the skew window', () => {
    expect(verifyQueueRequest({ secret, timestamp: null, signature: 'a', body, now })).toEqual({
      ok: false,
      reason: 'missing',
    })
    const old = String(Math.floor((now - SIGNATURE_MAX_SKEW_MS - 5_000) / 1000))
    const sig = signQueueRequest(secret, old, body)
    expect(verifyQueueRequest({ secret, timestamp: old, signature: sig, body, now })).toEqual({
      ok: false,
      reason: 'stale',
    })
    const future = String(Math.floor((now + SIGNATURE_MAX_SKEW_MS + 5_000) / 1000))
    expect(
      verifyQueueRequest({ secret, timestamp: future, signature: signQueueRequest(secret, future, body), body, now }).ok,
    ).toBe(false)
    expect(verifyQueueRequest({ secret, timestamp: '12abc', signature: sig, body, now }).ok).toBe(false)
  })
})

describe('job keys', () => {
  it('include the type prefix, ids and the UTC day', () => {
    const day = utcDay(new Date('2026-09-26T23:30:00-05:00'))
    expect(day).toBe('2026-09-27')
    expect(jobKeys.gmailSync('u1', day)).toBe('gmail-sync:u1:2026-09-27')
    expect(jobKeys.discoverySource('u1', 's1', day)).toBe('discovery-source:u1:s1:2026-09-27')
    expect(jobKeys.reminders(day)).toBe('reminders:all:2026-09-27')
  })
})

describe('stopMarginMs', () => {
  it('reserves 5% of the budget within [1 s, 10 s]', () => {
    expect(stopMarginMs(240_000)).toBe(10_000)
    expect(stopMarginMs(20_000)).toBe(1_000)
    expect(stopMarginMs(100_000)).toBe(5_000)
  })
})
