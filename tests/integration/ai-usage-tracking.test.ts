import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs, aiQuotaSnapshots } from '@/lib/db/schema'
import { makeUser } from '@/tests/factories'
import { withAiUsage } from '@/lib/ai/usage'
import { GroqProvider } from '@/lib/ai/groq'
import { GroqDecisionProvider } from '@/lib/decisions/groq'
import { writeSkipLog } from '@/lib/ai/log'

const originalFetch = globalThis.fetch

const RL_HEADERS = {
  'x-ratelimit-limit-requests': '1000',
  'x-ratelimit-remaining-requests': '990',
  'x-ratelimit-reset-requests': '1m26.4s',
  'x-ratelimit-limit-tokens': '8000',
  'x-ratelimit-remaining-tokens': '7000',
  'x-ratelimit-reset-tokens': '7.5s',
}

function groqJson(content: unknown, headers: Record<string, string> = RL_HEADERS): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    }),
    { status: 200, headers: { 'content-type': 'application/json', ...headers } },
  )
}

function rateLimited(): Response {
  return new Response('{"error":{"message":"Rate limit reached"}}', {
    status: 429,
    headers: { ...RL_HEADERS, 'x-ratelimit-remaining-tokens': '0', 'retry-after': '1' },
  })
}

const job = { title: 'Eng', company_name: 'Acme' }

async function rows() {
  return db.select().from(aiCallLogs).orderBy(asc(aiCallLogs.createdAt))
}

beforeEach(() => {
  globalThis.fetch = originalFetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('Groq generation logging', () => {
  it('logs each failed attempt (429 visible) and the success, with model and HTTP status', async () => {
    const u = await makeUser()
    const responses = [rateLimited(), groqJson(job)]
    globalThis.fetch = vi.fn(async () => responses.shift()!) as unknown as typeof fetch

    const { usage } = await withAiUsage({ userId: u.id }, () =>
      new GroqProvider('k', 'openai/gpt-oss-20b').parseJob('text'),
    )

    const logged = await rows()
    expect(logged.map((r) => [r.status, r.httpStatus])).toEqual([
      ['rate_limited', 429],
      ['ok', 200],
    ])
    expect(logged.every((r) => r.model === 'openai/gpt-oss-20b')).toBe(true)
    expect(logged.every((r) => r.userId === u.id)).toBe(true)
    expect(logged[1]).toMatchObject({ promptTokens: 120, completionTokens: 30 })
    expect(usage).toMatchObject({
      callId: logged[1]!.id,
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      inputTokens: 120,
      outputTokens: 30,
      calls: 1,
      failedAttempts: 1,
      rateLimited: 1,
      skipped: false,
    })
  }, 10_000)

  it('upserts one rate-limit snapshot per (user, provider, model)', async () => {
    const u = await makeUser()
    const responses = [
      groqJson(job),
      groqJson(job, { ...RL_HEADERS, 'x-ratelimit-remaining-requests': '989' }),
    ]
    globalThis.fetch = vi.fn(async () => responses.shift()!) as unknown as typeof fetch
    const ai = new GroqProvider('k', 'openai/gpt-oss-20b')
    await withAiUsage({ userId: u.id }, () => ai.parseJob('a'))
    await withAiUsage({ userId: u.id }, () => ai.parseJob('b'))

    const snaps = await db.select().from(aiQuotaSnapshots)
    expect(snaps).toHaveLength(1)
    expect(snaps[0]).toMatchObject({
      userId: u.id,
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      limitRequests: 1000,
      remainingRequests: 989,
      limitTokens: 8000,
      remainingTokens: 7000,
    })
    expect(snaps[0]!.resetTokensAt!.getTime()).toBeGreaterThan(snaps[0]!.observedAt.getTime())
  })

  it('never stores prompt text in the log row', async () => {
    const u = await makeUser()
    globalThis.fetch = vi.fn(async () => groqJson(job)) as unknown as typeof fetch
    await withAiUsage({ userId: u.id }, () =>
      new GroqProvider('k').parseJob('SECRET-JOB-DESCRIPTION'),
    )
    const serialized = JSON.stringify(await rows())
    expect(serialized).not.toContain('SECRET-JOB-DESCRIPTION')
  })
})

describe('Groq decision logging', () => {
  it('logs a decision call with token usage and the model', async () => {
    const u = await makeUser()
    globalThis.fetch = vi.fn(async () => groqJson({ pick: 'a', confidence: 0.9 })) as unknown as typeof fetch
    const { result, usage } = await withAiUsage({ userId: u.id }, () =>
      new GroqDecisionProvider('k', 'openai/gpt-oss-20b').choice({ text: 't', options: ['a', 'b'] }),
    )
    expect(result.pick).toBe('a')
    const [row] = await rows()
    expect(row).toMatchObject({
      provider: 'groq',
      kind: 'decision_choice',
      model: 'openai/gpt-oss-20b',
      status: 'ok',
      httpStatus: 200,
      promptTokens: 120,
      completionTokens: 30,
      userId: u.id,
    })
    expect(usage?.callId).toBe(row!.id)
  })

  it('logs a failed decision call with its HTTP status', async () => {
    globalThis.fetch = vi.fn(async () => rateLimited()) as unknown as typeof fetch
    await expect(
      new GroqDecisionProvider('k').yesNo({ text: 't', question: 'q' }),
    ).rejects.toThrow(/429/)
    const [row] = await rows()
    expect(row).toMatchObject({ kind: 'decision_yesno', status: 'rate_limited', httpStatus: 429 })
  })
})

describe('Gemini attempt logging', () => {
  afterEach(() => {
    vi.doUnmock('@google/generative-ai')
    vi.resetModules()
  })

  it('logs a 429 attempt as rate_limited before the successful retry', async () => {
    vi.resetModules()
    let calls = 0
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            generateContent: async () => {
              calls += 1
              if (calls === 1) {
                throw Object.assign(new Error('[429 Too Many Requests] quota'), { status: 429 })
              }
              return {
                response: {
                  text: () => JSON.stringify(job),
                  usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
                },
              }
            },
          }
        }
      },
    }))
    const { GeminiProvider } = await import('@/lib/ai/gemini')
    const { withAiUsage: scoped } = await import('@/lib/ai/usage')
    const u = await makeUser()
    const { usage } = await scoped({ userId: u.id }, () =>
      new GeminiProvider('k', 'gemini-3.6-flash').parseJob('text'),
    )
    const logged = await rows()
    expect(logged.map((r) => [r.status, r.httpStatus, r.model])).toEqual([
      ['rate_limited', 429, 'gemini-3.6-flash'],
      ['ok', null, 'gemini-3.6-flash'],
    ])
    expect(usage).toMatchObject({ inputTokens: 7, outputTokens: 3, rateLimited: 1 })
  }, 10_000)
})

describe('signal-check skips', () => {
  it('surface as a skipped usage object', async () => {
    const u = await makeUser()
    const { usage } = await withAiUsage({ userId: u.id }, () =>
      writeSkipLog({ userId: u.id, provider: 'unknown', kind: 'cover_letter' }, 'thin_cv'),
    )
    const [row] = await rows()
    expect(row?.status).toBe('skipped')
    expect(usage).toMatchObject({ callId: row!.id, skipped: true, calls: 0 })
  })
})
