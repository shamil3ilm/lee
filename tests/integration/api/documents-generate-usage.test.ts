import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'
import { saveMasterCV } from '@/lib/documents/master'
import { GroqProvider } from '@/lib/ai/groq'
import { settleDeferred } from '@/lib/server/after-response'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/ai', () => ({
  getAIProviderForUser: async () => new GroqProvider('k', 'openai/gpt-oss-20b'),
}))

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('POST generate-cover-letter usage', () => {
  it('returns a usage object and attributes the log row to the user and document', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const co = await makeCompany(u.id, { name: 'Stripe' })
    const job = await makeJob(u.id, co.id, { title: 'Staff Engineer' })
    const app = await makeApplication(u.id, job.id)
    await saveMasterCV(u.id, {
      basics: { name: 'Ada Lovelace', headline: 'Backend Engineer' },
      summary: 'Ships things.',
      experience: [
        { company: 'Acme', role: 'Senior Eng', start: '2020-01', end: 'present', bullets: ['built pipelines'] },
      ],
      skills: { primary: ['ts', 'node'] },
    })
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  applicationId: app.id,
                  greeting: 'Hi',
                  paragraphs: ['I build pipelines.'],
                  closing: 'Best',
                  senderName: 'Ada',
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1240, completion_tokens: 310 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const { POST } = await import('@/app/api/applications/[id]/documents/generate-cover-letter/route')
    const res = await POST(new Request('http://x', { method: 'POST' }), {
      params: Promise.resolve({ id: app.id }),
    })
    const json = (await res.json()) as {
      documentId: string
      usage: { callId: string; inputTokens: number; outputTokens: number; model: string }
    }
    expect(res.status).toBe(200)
    expect(json.usage).toMatchObject({ inputTokens: 1240, outputTokens: 310, model: 'openai/gpt-oss-20b' })

    await settleDeferred()
    const [row] = await db.select().from(aiCallLogs).where(eq(aiCallLogs.id, json.usage.callId))
    // The provider was never told the user: the usage scope supplies it,
    // which also lets the row link to the generated document.
    expect(row).toMatchObject({ userId: u.id, documentId: json.documentId, kind: 'cover_letter' })
  })
})
