import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { enqueueSourcePolls } from '@/lib/queue/scheduler'
import { overdueSources, warnPollBacklog } from '@/lib/queue/overdue-polls'
import { makeSource, makeUser } from '@/tests/factories'

const NOW = new Date('2026-10-12T12:00:00Z')
const HOUR = 3_600_000

describe('overdue sources (Settings › Sources › Coverage)', () => {
  it('flags enabled sources not polled for 26 hours, never-polled first, with when their poll was queued', async () => {
    const u = await makeUser()
    const old = new Date(NOW.getTime() - 72 * HOUR)
    const never = await makeSource(u.id, { name: 'Never', createdAt: old })
    const stale = await makeSource(u.id, { name: 'Stale', createdAt: old, lastPolledAt: new Date(NOW.getTime() - 30 * HOUR) })
    await makeSource(u.id, { name: 'Fresh', createdAt: old, lastPolledAt: new Date(NOW.getTime() - 2 * HOUR) })
    await makeSource(u.id, { name: 'Just added', createdAt: new Date(NOW.getTime() - HOUR) })
    await makeSource(u.id, { name: 'Off', createdAt: old, enabled: false })
    await makeSource(u.id, { name: 'Broken', createdAt: old, errorCount: 5 })
    await makeSource(u.id, { name: 'Link', kind: 'watch', createdAt: old })
    const queuedAt = new Date(NOW.getTime() - 50 * HOUR)
    await enqueueSourcePolls(u.id, [never.id], queuedAt)
    await db.update(queueJobs).set({ createdAt: queuedAt })

    const rows = await overdueSources(u.id, NOW)
    expect(rows.map((r) => r.name)).toEqual(['Never', 'Stale'])
    expect(rows[0]).toMatchObject({ id: never.id, lastPolledAt: null, queuedSince: queuedAt })
    expect(rows[1]).toMatchObject({ id: stale.id, queuedSince: null })
  })
})

describe('poll backlog warning', () => {
  it('warns when queued polls outnumber enabled sources', async () => {
    const warn = vi.spyOn(logger, 'warn')
    const ok = await makeUser()
    const s = await makeSource(ok.id)
    await enqueueSourcePolls(ok.id, [s.id], NOW)
    expect(await warnPollBacklog()).toEqual([])

    const piled = await makeUser()
    const a = await makeSource(piled.id)
    // Rows from before coalescing (no coalesce key): three days of polls for one source.
    await db.insert(queueJobs).values(
      ['09', '10', '11'].map((d) => ({ userId: piled.id, type: JOB_TYPES.discoverySource, payload: { sourceId: a.id }, idempotencyKey: `x-${d}` })),
    )
    expect(await warnPollBacklog()).toEqual([{ userId: piled.id, pending: 3, enabled: 1 }])
    expect(warn).toHaveBeenCalledWith('queue_poll_backlog', { userId: piled.id, pending: 3, enabled: 1 })
  })
})
