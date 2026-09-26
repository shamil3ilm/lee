import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { aiCallLogs, aiQuotaSnapshots } from '@/lib/db/schema'
import { makeUser } from '@/tests/factories'
import { quotaMeters, quotaStatus } from '@/lib/ai/quota'

describe('quotaStatus', () => {
  it('uses the provider snapshot while its window is open', async () => {
    const u = await makeUser()
    await db.insert(aiQuotaSnapshots).values({
      userId: u.id,
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      limitRequests: 1000,
      remainingRequests: 80,
      resetRequestsAt: new Date(Date.now() + 60_000),
      limitTokens: 8000,
      remainingTokens: 8000,
      resetTokensAt: new Date(Date.now() + 5_000),
    })
    const s = await quotaStatus(u.id, 'groq', 'openai/gpt-oss-20b')
    expect(s.level).toBe('critical')
    expect(s.dimensions.find((d) => d.key === 'requests_day')).toMatchObject({
      used: 920,
      source: 'provider',
    })
  })

  it('estimates Gemini usage locally against approximate published limits', async () => {
    const u = await makeUser()
    // 200 of the ~250 RPD free-tier requests → 80% → warn. Dated a few
    // minutes back so the per-minute limits are not what trips.
    const createdAt = new Date(Date.now() - 5 * 60_000)
    await db.insert(aiCallLogs).values(
      Array.from({ length: 200 }, () => ({
        createdAt,
        userId: u.id,
        provider: 'gemini',
        model: 'gemini-3.6-flash',
        kind: 'parse_job',
        status: 'ok',
        promptTokens: 10,
        completionTokens: 5,
      })),
    )
    // Rate-limited and skipped rows do not consume quota.
    await db.insert(aiCallLogs).values([
      { userId: u.id, provider: 'gemini', model: 'gemini-3.6-flash', kind: 'x', status: 'rate_limited' },
      { userId: u.id, provider: 'gemini', model: 'gemini-3.6-flash', kind: 'x', status: 'skipped' },
    ])
    const s = await quotaStatus(u.id, 'gemini', 'gemini-3.6-flash')
    const rpd = s.dimensions.find((d) => d.key === 'requests_day')!
    expect(rpd).toMatchObject({ used: 200, limit: 250, source: 'estimate', approximate: true })
    expect(s.level).toBe('warn')
    expect(s.approximate).toBe(true)
  })

  it('is scoped to the user', async () => {
    const [a, b] = [await makeUser(), await makeUser()]
    await db.insert(aiCallLogs).values(
      Array.from({ length: 240 }, () => ({
        userId: a.id,
        provider: 'gemini',
        model: 'gemini-3.6-flash',
        kind: 'parse_job',
        status: 'ok',
      })),
    )
    const s = await quotaStatus(b.id, 'gemini', 'gemini-3.6-flash')
    expect(s.level).toBe('ok')
  })
})

describe('quotaMeters', () => {
  it('lists every model with known limits, highest usage first', async () => {
    const u = await makeUser()
    const createdAt = new Date(Date.now() - 5 * 60_000)
    await db.insert(aiCallLogs).values([
      ...Array.from({ length: 5 }, () => ({
        createdAt,
        userId: u.id,
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
        kind: 'parse_job',
        status: 'ok',
      })),
      { createdAt, userId: u.id, provider: 'gemini', model: 'gemini-3.6-flash', kind: 'x', status: 'ok' },
      // Unknown model: no limits → no meter.
      { createdAt, userId: u.id, provider: 'groq', model: 'mystery', kind: 'x', status: 'ok' },
    ])
    const meters = await quotaMeters(u.id)
    expect(meters.map((m) => m.model)).toEqual(['openai/gpt-oss-20b', 'gemini-3.6-flash'])
    expect(meters[0]!.dimensions.find((d) => d.key === 'requests_day')?.used).toBe(5)
  })
})
