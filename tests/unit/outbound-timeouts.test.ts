import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { GroqProvider } from '@/lib/ai/groq'
import { GroqDecisionProvider } from '@/lib/decisions/groq'
import { LayaHttpDecisionProvider } from '@/lib/decisions/laya-http'
import { LayaUnavailableError } from '@/lib/decisions/types'
import { compileLatex } from '@/lib/latex/compile'
import { getThread, listThreads } from '@/lib/gmail/adapter'
import { createEvent, deleteEvent, updateEvent } from '@/lib/calendar/adapter'
import { getGoogleTokens } from '@/lib/google/tokens'
import { fetchPublicRepos } from '@/lib/github/adapter'
import { detectATSFromDomain } from '@/lib/companies/ats-detect'
import { getAdapter, listAdapterKinds } from '@/lib/discovery/adapters'
import { makeUser } from '@/tests/factories'

/**
 * Every outbound call must carry an AbortSignal, and a timeout must surface
 * as the error type that module already uses. The fake fetch below plays a
 * hung upstream that the caller's timeout signal gave up on: it rejects with
 * the DOMException `AbortSignal.timeout` produces — but only when a signal
 * was passed, so a missing timeout fails loudly instead of hanging.
 */
const originalFetch = globalThis.fetch
let calls: Array<{ url: string; signal: AbortSignal | undefined }> = []

function timingOutFetch(): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const signal = init?.signal ?? undefined
    calls.push({ url: String(input), signal })
    if (!(signal instanceof AbortSignal)) throw new Error(`no timeout signal on ${String(input)}`)
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  }) as unknown as typeof fetch
}

beforeEach(() => {
  calls = []
  globalThis.fetch = timingOutFetch()
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('outbound timeouts', () => {
  it('Groq: each attempt carries a timeout, a timeout is not retried, error is a plain Error', async () => {
    const groq = new GroqProvider('k')
    const err = await groq.parseJob('some job').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/^groq timed out after \d+ms$/)
    expect(calls).toHaveLength(1)
  })

  it('Groq decisions: timeout surfaces as Error', async () => {
    const p = new GroqDecisionProvider('k')
    await expect(p.yesNo({ question: 'q', text: 't' })).rejects.toThrow(/timed out/)
  })

  it('Laya: timeout surfaces as LayaUnavailableError', async () => {
    const p = new LayaHttpDecisionProvider('https://laya.test')
    const err = await p.yesNo({ question: 'q', text: 't' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LayaUnavailableError)
    expect((err as Error).message).toMatch(/timed out/)
  })

  it('latexonline: timeout is a 504 compile result, not a throw', async () => {
    const r = await compileLatex('\\documentclass{article}')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(504)
    expect(r.log).toMatch(/timed out/)
  })

  it('Gmail: list + get thread time out as Error', async () => {
    const tokens = { accessToken: 'a' }
    await expect(listThreads({ tokens })).rejects.toThrow(/gmail listThreads timed out/)
    await expect(getThread({ tokens, threadId: 't1' })).rejects.toThrow(/gmail getThread timed out/)
  })

  it('Calendar: create/update/delete time out as Error', async () => {
    const tokens = { accessToken: 'a' }
    const event = {
      summary: 's',
      start: { dateTime: '2026-01-01T10:00:00Z' },
      end: { dateTime: '2026-01-01T11:00:00Z' },
    }
    await expect(createEvent({ tokens, event })).rejects.toThrow(/calendar createEvent timed out/)
    await expect(updateEvent({ tokens, eventId: 'e', event })).rejects.toThrow(/calendar updateEvent timed out/)
    await expect(deleteEvent({ tokens, eventId: 'e' })).rejects.toThrow(/calendar deleteEvent timed out/)
  })

  it('Google token refresh: timeout surfaces as Error', async () => {
    const u = await makeUser()
    await db.insert(accounts).values({
      userId: u.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: `google-${u.id}`,
      access_token: 'old',
      refresh_token: 'rt',
      expires_at: 1,
    })
    await expect(getGoogleTokens(u.id)).rejects.toThrow(/google token refresh timed out/)
  })

  it('GitHub + ATS probes carry a timeout', async () => {
    await expect(fetchPublicRepos('octocat')).rejects.toThrow(/github timed out/)
    calls = []
    await expect(detectATSFromDomain('acme.com')).resolves.toBeNull()
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c.signal instanceof AbortSignal)).toBe(true)
  })

  const adapterConfigs: Record<string, unknown> = {
    greenhouse: { company: 'acme' },
    lever: { company: 'acme' },
    ashby: { company: 'acme' },
    workable: { company: 'acme' },
    remoteok: {},
    hn_whoishiring: {},
    rss: { url: 'https://feed.test/rss' },
    jsonld: { url: 'https://careers.test/jobs' },
    yc_directory: {},
  }

  it('covers every registered discovery adapter', () => {
    expect(Object.keys(adapterConfigs).sort()).toEqual(listAdapterKinds().sort())
  })

  it.each(Object.keys(adapterConfigs))('discovery adapter %s: every request has a timeout', async (kind) => {
    const adapter = getAdapter(kind)!
    const result = await adapter.fetch(adapterConfigs[kind]).catch((e: unknown) => e)
    // jsonld swallows per-URL failures; everything else throws an Error.
    if (kind === 'jsonld') expect(result).toEqual([])
    else expect((result as Error).message).toMatch(/timed out/)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c.signal instanceof AbortSignal)).toBe(true)
  })
})
