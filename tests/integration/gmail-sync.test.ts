import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, activities, processedGmailThreads, userProfile } from '@/lib/db/schema'
import { syncGmail } from '@/lib/gmail/sync'
import type { GmailThreadFull, GmailThreadSummary } from '@/lib/gmail/adapter'
import * as applications from '@/lib/db/queries/applications'
import * as applicationContacts from '@/lib/db/queries/applicationContacts'
import * as contactsQ from '@/lib/db/queries/contacts'
import * as companies from '@/lib/db/queries/companies'
import * as jobs from '@/lib/db/queries/jobs'
import { makeUser } from '@/tests/factories'

const originalFetch = globalThis.fetch

function makeThread(id: string, from: string, subject: string, snippet = ''): GmailThreadFull {
  return {
    id,
    messages: [
      {
        id: `${id}-m1`,
        threadId: id,
        snippet,
        internalDate: '1700000000000',
        payload: {
          headers: [
            { name: 'From', value: from },
            { name: 'Subject', value: subject },
          ],
        },
      },
    ],
  }
}

async function attachGoogleAccount(userId: string): Promise<void> {
  await db.insert(accounts).values({
    userId,
    type: 'oauth',
    provider: 'google',
    providerAccountId: `google-${userId}`,
    access_token: 'AT',
    refresh_token: 'RT',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'Bearer',
    scope: 'openid email profile gmail.readonly',
  })
}

describe('syncGmail', () => {
  beforeEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })
  afterEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })

  it('matches, logs an activity, marks the thread processed, updates syncedGmailAt', async () => {
    const u = await makeUser('sync1@x.com')
    await attachGoogleAccount(u.id)
    const co = await companies.findOrCreateByDomain(u.id, 'match.co', 'Match Co')
    const j = await jobs.upsertBySourceUrl(u.id, co.id, {
      title: 'SWE',
      sourceUrl: 'https://match.co/j/1',
    })
    const app = await applications.create(u.id, { jobId: j.id })
    const contact = await contactsQ.create(u.id, {
      companyId: co.id,
      name: 'Rae',
      email: 'rae@match.co',
    })
    await applicationContacts.link(u.id, app.id, contact.id, 'recruiter')

    const summaries: GmailThreadSummary[] = [
      { id: 't-match', historyId: '1', snippet: 'hello there' },
      { id: 't-nomatch', historyId: '2', snippet: 'spam' },
    ]

    const result = await syncGmail({
      userId: u.id,
      adapters: {
        listThreads: async () => summaries,
        getThread: async ({ threadId }) => {
          if (threadId === 't-match') {
            return makeThread('t-match', 'Rae <rae@match.co>', 'Interview follow-up', 'hi there')
          }
          return makeThread('t-nomatch', 'noone@nowhere.com', 'buy this', 'spam body')
        },
      },
    })

    expect(result).toEqual({ checked: 2, matched: 1, logged: 1 })

    const emailActs = await db
      .select()
      .from(activities)
      .where(and(eq(activities.userId, u.id), eq(activities.kind, 'email')))
    expect(emailActs).toHaveLength(1)
    expect(emailActs[0]?.applicationId).toBe(app.id)
    const payload = emailActs[0]?.payload as {
      threadId: string
      from: string
      subject: string
      snippet: string
      matchReason: string
    }
    expect(payload.threadId).toBe('t-match')
    expect(payload.from).toBe('rae@match.co')
    expect(payload.subject).toBe('Interview follow-up')
    expect(payload.matchReason).toBe('contact_email_match')

    const processed = await db
      .select()
      .from(processedGmailThreads)
      .where(eq(processedGmailThreads.userId, u.id))
    expect(processed).toHaveLength(2)

    const profile = await db.query.userProfile.findFirst({
      where: eq(userProfile.userId, u.id),
    })
    expect(profile?.syncedGmailAt).toBeInstanceOf(Date)
  })

  it('skips threads that are already in processed_gmail_threads', async () => {
    const u = await makeUser('sync2@x.com')
    await attachGoogleAccount(u.id)
    const co = await companies.findOrCreateByDomain(u.id, 'dup.co', 'Dup')
    const j = await jobs.upsertBySourceUrl(u.id, co.id, {
      title: 'SWE',
      sourceUrl: 'https://dup.co/j/1',
    })
    const app = await applications.create(u.id, { jobId: j.id })

    // Pre-seed as processed.
    await db.insert(processedGmailThreads).values({
      userId: u.id,
      threadId: 't-already',
      matchedApplicationId: app.id,
    })

    let getThreadCalls = 0
    const result = await syncGmail({
      userId: u.id,
      adapters: {
        listThreads: async () => [{ id: 't-already', historyId: '1', snippet: '' }],
        getThread: async () => {
          getThreadCalls += 1
          return makeThread('t-already', 'careers@dup.co', 'hi')
        },
      },
    })

    // Checked runs the loop iteration but getThread must never fire.
    expect(result.checked).toBe(1)
    expect(result.matched).toBe(0)
    expect(result.logged).toBe(0)
    expect(getThreadCalls).toBe(0)
  })

  it('logs the unmatched thread as processed with null applicationId', async () => {
    const u = await makeUser('sync3@x.com')
    await attachGoogleAccount(u.id)

    await syncGmail({
      userId: u.id,
      adapters: {
        listThreads: async () => [{ id: 't-x', historyId: '1', snippet: '' }],
        getThread: async () => makeThread('t-x', 'foo@bar.com', 'random'),
      },
    })

    const rows = await db
      .select()
      .from(processedGmailThreads)
      .where(eq(processedGmailThreads.userId, u.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.matchedApplicationId).toBeNull()
  })

  it('continues after per-thread errors (does not abort the sync)', async () => {
    const u = await makeUser('sync4@x.com')
    await attachGoogleAccount(u.id)

    const result = await syncGmail({
      userId: u.id,
      adapters: {
        listThreads: async () => [
          { id: 't-boom', historyId: '1', snippet: '' },
          { id: 't-ok', historyId: '2', snippet: '' },
        ],
        getThread: async ({ threadId }) => {
          if (threadId === 't-boom') throw new Error('gmail 500')
          return makeThread('t-ok', 'foo@bar.com', 'random')
        },
      },
    })

    expect(result.checked).toBe(2)
    // t-ok processed successfully; t-boom never got recorded because the error
    // aborted before markProcessed. That is acceptable — next cycle retries.
    const rows = await db
      .select()
      .from(processedGmailThreads)
      .where(eq(processedGmailThreads.userId, u.id))
    expect(rows.map((r) => r.threadId)).toEqual(['t-ok'])
  })
})
