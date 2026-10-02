import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { systemEventCounts, systemEvents } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { withLogContext } from '@/lib/logs/context'
import { latestUserEvent, listEvents, parseEventFilters } from '@/lib/logs/queries'
import { flushSystemEvents, installEventSink, uninstallEventSink } from '@/lib/logs/sink'
import { INFO_EVENT_RETENTION_DAYS, PROBLEM_EVENT_RETENTION_DAYS, pruneSystemEvents } from '@/lib/db/retention'
import { drain } from '@/lib/queue/drain'
import { enqueue } from '@/lib/queue/queue'
import { createRegistry, defineHandler } from '@/lib/queue/registry'
import { makeUser } from '@/tests/factories'

const DAY = 24 * 60 * 60 * 1000

async function persisted() {
  await flushSystemEvents()
  return db.select().from(systemEvents).orderBy(systemEvents.createdAt)
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  installEventSink()
})

afterEach(async () => {
  await flushSystemEvents()
  uninstallEventSink()
  vi.restoreAllMocks()
})

describe('logger sink: levels and allow-list', () => {
  it('persists warn and error always, allow-listed info only, never debug', async () => {
    const u = await makeUser()
    logger.warn('addSource failed', { userId: u.id, err: 'boom' })
    logger.error('POST /api/todos failed', { err: 'db down' })
    logger.info('gmail_sync_done', { userId: u.id, checked: 40, matched: 2, logged: 2 })
    logger.info('voice_transcribe_ok', { userId: u.id, ms: 20 })
    logger.debug('queue_drain', { claimed: 1 })
    const rows = await persisted()
    expect(rows.map((r) => [r.level, r.category, r.event]).sort()).toEqual(
      [
        ['error', 'app', 'post_api_todos_failed'],
        ['info', 'gmail', 'gmail_sync_done'],
        ['warn', 'source', 'add_source_failed'],
      ].sort(),
    )
    const gmail = rows.find((r) => r.event === 'gmail_sync_done')
    expect(gmail?.userId).toBe(u.id)
    expect(gmail?.message).toBe('Gmail synced: 40 checked · 2 matched')
    expect(gmail?.context).toEqual({ checked: 40, matched: 2, logged: 2 })
    expect(rows.find((r) => r.event === 'post_api_todos_failed')?.userId).toBeNull()
  })

  it('redacts secrets, reduces emails to domains and drops content keys', async () => {
    const u = await makeUser()
    logger.error('generate-cover-letter failed', {
      userId: u.id,
      err: 'Groq 401 for key gsk_abcdef1234567890 (owner jane@example.com) Bearer abc.def',
      prompt: 'Write a cover letter for my CV…',
      cvText: 'Jane Doe, 10 years…',
      subject: 'Your offer',
      accessToken: 'ya29.secret',
      tokens: 812,
    })
    const [row] = await persisted()
    expect(row?.context).toEqual({
      err: 'Groq 401 for key [redacted-key] (owner *@example.com) Bearer [redacted]',
      tokens: 812,
    })
    expect(JSON.stringify(row)).not.toMatch(/gsk_|jane@|cover letter for my|Jane Doe|Your offer|ya29/)
    expect(row?.message).toBe('Generate cover letter failed: Groq 401 for key [redacted-key] (owner *@example.com) Bearer [redacted]')
  })

  it('attributes events logged inside a job to its user and job', async () => {
    const u = await makeUser()
    const registry = createRegistry([
      defineHandler({
        type: 'noisy',
        scope: 'user',
        payload: z.object({}).passthrough(),
        timeoutMs: 5_000,
        async run() {
          logger.warn('drive_api_error', { label: 'upload', status: 503 })
          return { summary: { kind: 'followups', nudged: 1 } }
        },
      }),
    ])
    const jobId = await enqueue('noisy', {}, { userId: u.id })
    await drain({ budgetMs: 30_000, registry })
    const rows = await persisted()
    const drive = rows.find((r) => r.event === 'drive_api_error')
    expect(drive).toMatchObject({ userId: u.id, jobId, category: 'drive', level: 'warn' })
    const done = rows.find((r) => r.event === 'queue_job_done')
    expect(done).toMatchObject({ userId: u.id, jobId, category: 'job' })
    expect(done?.message).toBe('Background task done: 1 follow-up nudged')
    expect(rows.find((r) => r.event === 'queue_drain')?.userId).toBeNull()
  })

  it('ambient context never overrides explicit ids, and invalid ids are ignored', async () => {
    const u = await makeUser()
    const other = await makeUser()
    withLogContext({ userId: other.id }, () => logger.warn('x_failed', { userId: u.id, jobId: 'not-a-uuid' }))
    const [row] = await persisted()
    expect(row?.userId).toBe(u.id)
    expect(row?.jobId).toBeNull()
  })

  it('never throws or blocks the caller when the database write fails', async () => {
    vi.spyOn(db, 'insert').mockImplementation(() => {
      throw new Error('db is down')
    })
    expect(() => logger.error('anything_failed', { err: 'x' })).not.toThrow()
    await flushSystemEvents()
    const warned = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes('system_events_sink_failed'))
    expect(warned.length).toBeGreaterThan(0)
    vi.mocked(db.insert).mockRestore()
    // The sink's own failure is stdout-only: nothing recursed into the table.
    expect(await db.select().from(systemEvents)).toHaveLength(0)
  })
})

describe('daily cap', () => {
  it('stops persisting info/warn at the cap but keeps errors up to the error cap', async () => {
    uninstallEventSink()
    installEventSink({ dailyCap: 3, errorCap: 5 })
    for (let i = 0; i < 5; i++) logger.warn('w_failed', { i })
    await flushSystemEvents()
    for (let i = 0; i < 4; i++) logger.error('e_failed', { i })
    logger.info('queue_drain', { claimed: 1 })
    const rows = await persisted()
    expect(rows.filter((r) => r.level === 'warn')).toHaveLength(3)
    expect(rows.filter((r) => r.level === 'error')).toHaveLength(2)
    expect(rows.filter((r) => r.level === 'info')).toHaveLength(0)
    const [count] = await db.select().from(systemEventCounts)
    expect(count?.n).toBe(5)
  })
})

describe('retention', () => {
  it(`deletes info after ${INFO_EVENT_RETENTION_DAYS} days and warn/error after ${PROBLEM_EVENT_RETENTION_DAYS}`, async () => {
    const now = new Date('2026-09-27T00:00:00Z')
    const at = (days: number) => new Date(now.getTime() - days * DAY)
    const base = { category: 'app', event: 'e', message: 'm' }
    await db.insert(systemEvents).values([
      { ...base, level: 'info', createdAt: at(13) },
      { ...base, level: 'info', createdAt: at(15) },
      { ...base, level: 'warn', createdAt: at(59) },
      { ...base, level: 'warn', createdAt: at(61) },
      { ...base, level: 'error', createdAt: at(61) },
    ])
    await db.insert(systemEventCounts).values([
      { day: '2026-09-26', n: 3 },
      { day: '2026-09-01', n: 3 },
    ])
    expect(await pruneSystemEvents(now)).toBe(3)
    const left = await db.select().from(systemEvents)
    expect(left.map((r) => r.level).sort()).toEqual(['info', 'warn'])
    expect((await db.select().from(systemEventCounts)).map((c) => c.day)).toEqual(['2026-09-26'])
  })
})

describe('owner-scoped queries', () => {
  it('lists own and global events, never another user’s, with filters and pagination', async () => {
    uninstallEventSink()
    const me = await makeUser()
    const other = await makeUser()
    const now = new Date()
    const base = { message: 'm', event: 'e' }
    await db.insert(systemEvents).values([
      { ...base, userId: me.id, level: 'info', category: 'gmail', message: 'Gmail synced', createdAt: now },
      { ...base, userId: me.id, level: 'error', category: 'ai', message: 'Groq 500', createdAt: now },
      { ...base, userId: null, level: 'info', category: 'cron', message: 'Retention ran', createdAt: now },
      { ...base, userId: other.id, level: 'error', category: 'ai', message: 'their secret', createdAt: now },
      { ...base, userId: me.id, level: 'warn', category: 'ai', message: 'old', createdAt: new Date(now.getTime() - 10 * DAY) },
    ])
    const all = await listEvents(me.id, { range: '7d' }, 1, now)
    expect(all.rows.map((r) => r.message).sort()).toEqual(['Gmail synced', 'Groq 500', 'Retention ran'])
    expect(all.rows.find((r) => r.message === 'Retention ran')?.global).toBe(true)
    expect((await listEvents(me.id, { range: '30d', category: 'ai' }, 1, now)).rows.map((r) => r.message).sort()).toEqual([
      'Groq 500',
      'old',
    ])
    expect((await listEvents(me.id, { range: '30d', level: 'problems' }, 1, now)).rows).toHaveLength(2)
    expect((await listEvents(me.id, { range: '7d', q: 'gmail' }, 1, now)).rows.map((r) => r.message)).toEqual([
      'Gmail synced',
    ])
    expect((await listEvents(me.id, { range: '7d', q: '%' }, 1, now)).rows).toHaveLength(0)

    await db.insert(systemEvents).values(
      Array.from({ length: 60 }, (_, i) => ({ ...base, userId: me.id, level: 'info', category: 'job', createdAt: new Date(now.getTime() - i * 1000) })),
    )
    const p1 = await listEvents(me.id, { range: '7d', category: 'job' }, 1, now)
    const p2 = await listEvents(me.id, { range: '7d', category: 'job' }, 2, now)
    expect(p1.rows).toHaveLength(50)
    expect(p1.hasNext).toBe(true)
    expect(p2.rows).toHaveLength(10)
    expect(p2.hasNext).toBe(false)
  })

  it('latestUserEvent finds the user’s newest matching event only', async () => {
    uninstallEventSink()
    const me = await makeUser()
    const other = await makeUser()
    const now = Date.now()
    await db.insert(systemEvents).values([
      { userId: me.id, level: 'info', category: 'gmail', event: 'gmail_sync_done', message: 'old', createdAt: new Date(now - 5000) },
      { userId: me.id, level: 'info', category: 'gmail', event: 'gmail_sync_done', message: 'new', createdAt: new Date(now) },
      { userId: other.id, level: 'info', category: 'gmail', event: 'gmail_sync_done', message: 'theirs', createdAt: new Date(now + 5000) },
    ])
    expect((await latestUserEvent(me.id, 'gmail', ['gmail_sync_done']))?.message).toBe('new')
    expect(await latestUserEvent(me.id, 'drive', ['drive_migrate_done'])).toBeNull()
  })

  it('parses untrusted filter params', () => {
    expect(parseEventFilters({ category: 'gmail', level: 'problems', range: '24h', q: '  x ', page: '3' })).toEqual({
      category: 'gmail',
      level: 'problems',
      range: '24h',
      q: 'x',
      sourceId: undefined,
      jobId: undefined,
      page: 3,
    })
    expect(parseEventFilters({ category: 'nope', level: 'debug', range: '1y', page: '-2', source: 'x' })).toMatchObject({
      category: undefined,
      level: undefined,
      range: '7d',
      page: 1,
      sourceId: undefined,
    })
  })
})
