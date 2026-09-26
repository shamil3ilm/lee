import { describe, expect, it } from 'vitest'
import { aiScopeUserId, AiUsageScope, noteAiCall, withAiUsage } from '@/lib/ai/usage'

const ok = (over: Partial<Parameters<typeof noteAiCall>[0]> = {}) =>
  noteAiCall({
    callId: 'c1',
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    status: 'ok',
    inputTokens: 100,
    outputTokens: 20,
    latencyMs: 300,
    ...over,
  })

describe('AI usage scope', () => {
  it('returns null usage when no AI call happened', async () => {
    const { result, usage } = await withAiUsage({ userId: 'u1' }, async () => 42)
    expect(result).toBe(42)
    expect(usage).toBeNull()
  })

  it('exposes the scope user id to providers', async () => {
    expect(aiScopeUserId()).toBeUndefined()
    await withAiUsage({ userId: 'u1' }, async () => {
      expect(aiScopeUserId()).toBe('u1')
    })
  })

  it('summarises a single successful call', async () => {
    const { usage } = await withAiUsage({}, async () => ok())
    expect(usage).toEqual({
      callId: 'c1',
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      inputTokens: 100,
      outputTokens: 20,
      latencyMs: 300,
      calls: 1,
      failedAttempts: 0,
      rateLimited: 0,
      cached: false,
      skipped: false,
    })
  })

  it('sums several calls and counts failed and rate-limited attempts', async () => {
    const { usage } = await withAiUsage({}, async () => {
      ok({ callId: 'a', status: 'rate_limited', inputTokens: 0, outputTokens: 0, latencyMs: 50 })
      ok({ callId: 'b', status: 'error', inputTokens: 0, outputTokens: 0, latencyMs: 60 })
      ok({ callId: 'c', inputTokens: 10, outputTokens: 5, latencyMs: 100 })
      ok({ callId: 'd', inputTokens: 1, outputTokens: 1, latencyMs: 10, model: 'm2' })
    })
    expect(usage).toMatchObject({
      callId: 'd',
      model: 'm2',
      inputTokens: 11,
      outputTokens: 6,
      latencyMs: 110,
      calls: 2,
      failedAttempts: 2,
      rateLimited: 1,
    })
  })

  it('flags a signal-check skip', async () => {
    const { usage } = await withAiUsage({}, async () =>
      ok({ callId: 's', provider: 'unknown', model: null, status: 'skipped', inputTokens: 0, outputTokens: 0, latencyMs: 0 }),
    )
    expect(usage).toMatchObject({ callId: 's', skipped: true, calls: 0 })
  })

  it('keeps usage readable after the wrapped work throws', async () => {
    const scope = new AiUsageScope('u1')
    await expect(
      scope.run(async () => {
        ok({ callId: 'x', status: 'error', inputTokens: 0, outputTokens: 0 })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(scope.usage).toMatchObject({ callId: 'x', calls: 0, failedAttempts: 1 })
  })

  it('isolates parallel scopes', async () => {
    const [a, b] = await Promise.all([
      withAiUsage({}, async () => {
        await new Promise((r) => setTimeout(r, 5))
        ok({ callId: 'A' })
      }),
      withAiUsage({}, async () => ok({ callId: 'B' })),
    ])
    expect(a.usage?.callId).toBe('A')
    expect(b.usage?.callId).toBe('B')
  })

  it('noteAiCall outside a scope is a no-op', () => {
    expect(() => ok()).not.toThrow()
  })
})
