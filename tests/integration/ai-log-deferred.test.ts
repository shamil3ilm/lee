import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'
import { makeUser } from '@/tests/factories'

/**
 * AI call logging must not hold the response: inside a request the
 * ai_call_logs insert is handed to `after()`; outside one (cron, tests) it
 * is awaited so the row exists when the call returns. Callers that need the
 * row id (`onLogged`, used for foreign keys) still get it inline.
 */
const originalFetch = globalThis.fetch
let scheduled: Array<Promise<unknown>> = []

function groqOk(): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ title: 'Eng', company: 'Acme' }) } }],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      }),
      { status: 200 },
    )) as unknown as typeof fetch
}

function mockRequestScope(): void {
  vi.doMock('next/server', async (orig) => ({
    ...(await orig<typeof import('next/server')>()),
    after: (task: Promise<unknown>) => {
      scheduled.push(task)
    },
  }))
}

beforeEach(() => {
  scheduled = []
  vi.resetModules()
  globalThis.fetch = groqOk()
})
afterEach(() => {
  globalThis.fetch = originalFetch
  vi.doUnmock('next/server')
  vi.resetModules()
})

async function logRows() {
  return db.select().from(aiCallLogs)
}

describe('deferred AI call logging', () => {
  it('outside a request the log row exists as soon as the call returns', async () => {
    const { GroqProvider } = await import('@/lib/ai/groq')
    await new GroqProvider('k').parseJob('job text').catch(() => null)
    const rows = await logRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.provider).toBe('groq')
  })

  it('inside a request the insert is handed to after() and still lands', async () => {
    mockRequestScope()
    const { GroqProvider } = await import('@/lib/ai/groq')
    await new GroqProvider('k').parseJob('job text').catch(() => null)
    expect(scheduled).toHaveLength(1)
    await Promise.all(scheduled)
    const rows = await logRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('ok')
    expect(rows[0]?.promptTokens).toBe(3)
  })

  it('onLogged callers get the id inline (FK linkage), not via after()', async () => {
    mockRequestScope()
    const u = await makeUser()
    const { GroqProvider } = await import('@/lib/ai/groq')
    let id: string | null = null
    await new GroqProvider('k')
      .parseJob('job text', { userId: u.id, onLogged: (x) => (id = x) })
      .catch(() => null)
    expect(scheduled).toHaveLength(0)
    expect(id).not.toBeNull()
    const [row] = await db.select().from(aiCallLogs).where(eq(aiCallLogs.id, id!))
    expect(row?.userId).toBe(u.id)
  })

  it('Gemini defers its log row the same way', async () => {
    mockRequestScope()
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            generateContent: async () => ({
              response: {
                text: () => JSON.stringify({ title: 'Eng', company: 'Acme' }),
                usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
              },
            }),
          }
        }
      },
    }))
    const { GeminiProvider } = await import('@/lib/ai/gemini')
    await new GeminiProvider('k').parseJob('job text').catch(() => null)
    vi.doUnmock('@google/generative-ai')
    expect(scheduled).toHaveLength(1)
    await Promise.all(scheduled)
    const rows = await logRows()
    expect(rows.map((r) => r.provider)).toEqual(['gemini'])
  })

  it('Laya defers its decision log row', async () => {
    mockRequestScope()
    globalThis.fetch = (async (url: string) => {
      if (String(url).endsWith('/run_playground')) {
        return new Response(JSON.stringify({ event_id: 'e1' }), { status: 200 })
      }
      return new Response(`event: complete\ndata: ${JSON.stringify([[], JSON.stringify({ answers: { answer: { noul: 0.9 } } })])}\n`, {
        status: 200,
      })
    }) as unknown as typeof fetch
    const { LayaHttpDecisionProvider } = await import('@/lib/decisions/laya-http')
    const r = await new LayaHttpDecisionProvider('https://laya.test').yesNo({ question: 'q', text: 't' })
    expect(r.answer).toBe(true)
    expect(scheduled).toHaveLength(1)
    await Promise.all(scheduled)
    const rows = await logRows()
    expect(rows.map((x) => x.kind)).toEqual(['decision_yesno'])
  })

  it('linkLatestCallToDocument waits for the deferred log insert before linking', async () => {
    mockRequestScope()
    const u = await makeUser()
    const { GroqProvider } = await import('@/lib/ai/groq')
    const { linkLatestCallToDocument } = await import('@/lib/ai/log')
    await new GroqProvider('k').parseJob('job text', { userId: u.id }).catch(() => null)
    // A document id that does not exist would violate the FK, so link to a
    // real one: reuse the documents factory-free path via a raw insert.
    const { documents } = await import('@/lib/db/schema')
    const [doc] = await db
      .insert(documents)
      .values({ userId: u.id, kind: 'cover_letter', title: 't', content: {} })
      .returning()
    await linkLatestCallToDocument(u.id, doc!.id, 'cover_letter')
    await Promise.all(scheduled)
    // Nested deferrals (link waits for the log) may schedule more work.
    await Promise.all(scheduled)
    const rows = await logRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.documentId).toBe(doc!.id)
  })
})
