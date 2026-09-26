import { describe, expect, it, vi } from 'vitest'
import { db, pgliteClient } from '@/lib/db/client'
import { accounts, processedGmailThreads } from '@/lib/db/schema'
import { GMAIL_THREAD_CONCURRENCY, syncGmail } from '@/lib/gmail/sync'
import type { GmailThreadFull, GmailThreadSummary } from '@/lib/gmail/adapter'
import { makeUser } from '@/tests/factories'

function thread(id: string): GmailThreadFull {
  return {
    id,
    messages: [
      {
        id: `${id}-m1`,
        threadId: id,
        snippet: '',
        internalDate: '1700000000000',
        payload: { headers: [{ name: 'From', value: 'nobody@unknown.test' }, { name: 'Subject', value: 'hi' }] },
      },
    ],
  }
}

describe('syncGmail batching', () => {
  it('checks processed threads with one query and fetches only new threads, a few at a time', async () => {
    const u = await makeUser()
    await db.insert(accounts).values({
      userId: u.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: `google-${u.id}`,
      access_token: 'AT',
      refresh_token: 'RT',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
    const summaries: GmailThreadSummary[] = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      historyId: '1',
      snippet: '',
    }))
    // 18 already processed on an earlier run.
    await db
      .insert(processedGmailThreads)
      .values(summaries.slice(0, 18).map((s) => ({ userId: u.id, threadId: s.id })))

    let active = 0
    let peak = 0
    const fetched: string[] = []
    const getThread = vi.fn(async ({ threadId }: { threadId: string }) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active -= 1
      fetched.push(threadId)
      return thread(threadId)
    })

    const spy = vi.spyOn(pgliteClient!, 'query')
    const result = await syncGmail({
      userId: u.id,
      adapters: { listThreads: async () => summaries, getThread },
    })
    const sqls = spy.mock.calls.map((c) => String(c[0]))
    spy.mockRestore()

    expect(result.checked).toBe(30)
    expect(fetched.sort()).toEqual(summaries.slice(18).map((s) => s.id).sort())
    const processedLookups = sqls.filter((s) => /select .* from "processed_gmail_threads"/is.test(s))
    expect(processedLookups).toHaveLength(1)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(GMAIL_THREAD_CONCURRENCY)
    expect(await db.select().from(processedGmailThreads)).toHaveLength(30)
  })
})
