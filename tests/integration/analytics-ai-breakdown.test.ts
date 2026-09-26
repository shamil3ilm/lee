import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'
import { makeUser } from '@/tests/factories'
import { aiUsageBreakdown } from '@/lib/analytics/ai-usage-breakdown'

type Row = typeof aiCallLogs.$inferInsert

describe('aiUsageBreakdown', () => {
  it('aggregates tokens by day, model and feature with calls, errors, 429s and latency', async () => {
    const [u, other] = [await makeUser(), await makeUser()]
    const today = new Date()
    const yesterday = new Date(today.getTime() - 86_400_000)
    const base = { userId: u.id, provider: 'groq', model: 'openai/gpt-oss-20b' }
    const rows: Row[] = [
      { ...base, kind: 'cover_letter', status: 'ok', promptTokens: 1000, completionTokens: 200, latencyMs: 1000, createdAt: today },
      { ...base, kind: 'cover_letter', status: 'ok', promptTokens: 500, completionTokens: 100, latencyMs: 3000, createdAt: yesterday },
      { ...base, kind: 'cover_letter', status: 'rate_limited', httpStatus: 429, latencyMs: 50, createdAt: today },
      { ...base, kind: 'score_job', status: 'error', httpStatus: 500, latencyMs: 70, createdAt: today },
      { userId: u.id, provider: 'gemini', model: 'gemini-3.6-flash', kind: 'score_job', status: 'ok', promptTokens: 10, completionTokens: 5, latencyMs: 200, createdAt: today },
      // Skips are not model calls; old rows and other users are out of scope.
      { userId: u.id, provider: 'unknown', kind: 'cover_letter', status: 'skipped', createdAt: today },
      { ...base, kind: 'cover_letter', status: 'ok', promptTokens: 9999, createdAt: new Date(today.getTime() - 40 * 86_400_000) },
      { ...base, userId: other.id, kind: 'cover_letter', status: 'ok', promptTokens: 9999, createdAt: today },
    ]
    await db.insert(aiCallLogs).values(rows)

    const b = await aiUsageBreakdown(u.id, 30)

    // Calls = every attempt that reached a provider (failed ones included).
    expect(b.totals).toEqual({
      calls: 5,
      errors: 1,
      rateLimited: 1,
      inputTokens: 1510,
      outputTokens: 305,
      avgLatencyMs: 1400,
    })
    expect(b.byDay).toHaveLength(31)
    const todayKey = today.toISOString().slice(0, 10)
    expect(b.byDay.find((d) => d.date === todayKey)).toMatchObject({
      inputTokens: 1010,
      outputTokens: 205,
      rateLimited: 1,
      errors: 1,
    })
    expect(b.byModel[0]).toMatchObject({
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      calls: 4,
      inputTokens: 1500,
      errors: 1,
      rateLimited: 1,
      avgLatencyMs: 2000,
    })
    expect(b.byFeature.map((f) => f.kind)).toEqual(['cover_letter', 'score_job'])
    expect(b.byFeature[1]).toMatchObject({ calls: 2, errors: 1, inputTokens: 10 })
  })

  it('returns zeroed totals and a back-filled day axis for a new user', async () => {
    const u = await makeUser()
    const b = await aiUsageBreakdown(u.id, 7)
    expect(b.totals.calls).toBe(0)
    expect(b.totals.avgLatencyMs).toBe(0)
    expect(b.byDay).toHaveLength(8)
    expect(b.byModel).toEqual([])
  })
})
