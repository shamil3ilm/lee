import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'

// Head off the transitive import of `@google/generative-ai` via `@/lib/ai`.
// The route calls `getAIProviderForUser` for the discovery cycle; the real
// module pulls in the Google GenAI SDK, which then poisons the module cache
// and breaks `ai-gemini-v2.test.ts`'s `vi.mock` when that file runs later in
// the same worker (isolate: false shares module state across files).
// We mock the full module surface (not just `getAIProviderForUser`) so
// nothing under lib/ai is loaded at test-file evaluation time.
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => ({
    parseJob: async () => {
      throw new Error('stubbed')
    },
  }),
  getAIProviderForUser: async () => ({
    parseJob: async () => {
      throw new Error('stubbed')
    },
  }),
  MODEL_REGISTRY: [],
  DEFAULT_MODEL_ID: 'gemini:gemini-2.0-flash',
  findModel: () => null,
}))

import { GET } from '@/app/api/cron/sync-all/route'
import { db } from '@/lib/db/client'
import { activities, accounts } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

const originalFetch = globalThis.fetch

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/sync-all', {
    method: 'GET',
    headers,
  })
}

describe('GET /api/cron/sync-all', () => {
  beforeEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })
  afterEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })

  it('rejects requests without the correct bearer token', async () => {
    const res = await GET(buildRequest() as never)
    expect(res.status).toBe(401)
  })

  it('rejects requests with a wrong bearer token', async () => {
    const res = await GET(buildRequest({ authorization: 'Bearer nope' }) as never)
    expect(res.status).toBe(401)
  })

  it('runs reminders across all users and returns totals', async () => {
    // Two users, one with a due next-action, one without.
    const uA = await makeUser('cron-a@x.com')
    const cA = await makeCompany(uA.id)
    const jA = await makeJob(uA.id, cA.id)
    const past = new Date(Date.now() - 60_000)
    const dueApp = await makeApplication(uA.id, jA.id, {
      status: 'applied',
      nextActionAt: past,
    })

    const uB = await makeUser('cron-b@x.com')
    const cB = await makeCompany(uB.id)
    const jB = await makeJob(uB.id, cB.id)
    await makeApplication(uB.id, jB.id, {
      status: 'applied',
      nextActionAt: new Date(Date.now() + 60_000),
    })

    // Both users have NO google account — gmail sync must skip silently
    // rather than counting as an error.

    // Guard: any fetch attempt would come from discovery adapters. Return an
    // error body — the discovery service already handles per-source failures.
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('nothing', { status: 500 })) as unknown as typeof fetch

    const res = await GET(
      buildRequest({ authorization: `Bearer ${env.CRON_SECRET}` }) as never,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      users: number
      reminders_added: number
      errors: string[]
    }
    expect(body.users).toBe(2)
    expect(body.reminders_added).toBe(1)

    const acts = await db
      .select()
      .from(activities)
      .where(eq(activities.applicationId, dueApp.id))
    expect(acts.some((a) => a.kind === 'reminder')).toBe(true)
  })

  it('emits followup_recommended activities for applications past the 7-day mark', async () => {
    const u = await makeUser('cron-followup@x.com')
    const co = await makeCompany(u.id)
    const j = await makeJob(u.id, co.id)
    const appliedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    const app = await makeApplication(u.id, j.id, { status: 'applied', appliedAt })

    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('nothing', { status: 500 })) as unknown as typeof fetch

    const res = await GET(
      buildRequest({ authorization: `Bearer ${env.CRON_SECRET}` }) as never,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { followups_recommended: number }
    expect(body.followups_recommended).toBeGreaterThanOrEqual(1)

    const acts = await db
      .select()
      .from(activities)
      .where(eq(activities.applicationId, app.id))
    const nudge = acts.find((a) => a.kind === 'followup_recommended')
    expect(nudge).toBeDefined()
    const payload = nudge?.payload as { daysSince?: number; suggestedInterval?: number }
    expect(payload?.suggestedInterval).toBe(7)
  })

  it('does not double-emit followup_recommended on consecutive runs', async () => {
    const u = await makeUser('cron-followup-dedup@x.com')
    const co = await makeCompany(u.id)
    const j = await makeJob(u.id, co.id)
    const appliedAt = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    const app = await makeApplication(u.id, j.id, { status: 'applied', appliedAt })

    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('nothing', { status: 500 })) as unknown as typeof fetch

    await GET(buildRequest({ authorization: `Bearer ${env.CRON_SECRET}` }) as never)
    await GET(buildRequest({ authorization: `Bearer ${env.CRON_SECRET}` }) as never)

    const nudges = (
      await db.select().from(activities).where(eq(activities.applicationId, app.id))
    ).filter((a) => a.kind === 'followup_recommended')
    expect(nudges).toHaveLength(1)
  })

  it('counts gmail results for users with a connected google account', async () => {
    const u = await makeUser('cron-gmail@x.com')
    await db.insert(accounts).values({
      userId: u.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: `google-${u.id}`,
      access_token: 'AT',
      refresh_token: 'RT',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'Bearer',
      scope: 'gmail.readonly',
    })

    // Route the mocked fetch to return an empty threads list — sync completes
    // with checked=0 and does not error.
    ;(globalThis as { fetch: typeof fetch }).fetch = (async (input: string) => {
      if (String(input).includes('gmail.googleapis.com')) {
        return new Response(JSON.stringify({ threads: [] }), { status: 200 })
      }
      return new Response('nothing', { status: 500 })
    }) as unknown as typeof fetch

    const res = await GET(
      buildRequest({ authorization: `Bearer ${env.CRON_SECRET}` }) as never,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      gmail_checked: number
      gmail_matched: number
      errors: string[]
    }
    expect(body.gmail_checked).toBe(0)
    expect(body.gmail_matched).toBe(0)
    // The gmail branch itself must not produce an error entry.
    expect(body.errors.every((e) => !e.includes('gmail'))).toBe(true)
  })
})
