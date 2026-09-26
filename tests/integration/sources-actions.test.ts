import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { sources } from '@/lib/db/schema'
import {
  addSource,
  updateSource,
  removeSource,
  toggleSourceEnabled,
} from '@/app/(authed)/settings/sources/actions'
import { queueJobs } from '@/lib/db/schema'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { makeUser, makeSource } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

function fd(values: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(values)) f.set(k, v)
  return f
}

async function getSource(id: string) {
  const [row] = await db.select().from(sources).where(eq(sources.id, id))
  return row
}

beforeEach(() => sessionMock.mockReset())

describe('updateSource', () => {
  it('renames and changes the board slug, keeping other config keys and clearing errors', async () => {
    const me = await makeUser()
    const s = await makeSource(me.id, {
      name: 'Old',
      kind: 'greenhouse',
      config: { company: 'old-slug', companyId: 'keep-me' },
      lastError: 'HTTP 404',
      errorCount: 3,
    })
    sessionMock.mockResolvedValue(me.id)

    const r = await updateSource(s.id, fd({ name: 'Stripe board', company: 'stripe' }))
    expect(r).toEqual({ success: true })
    const row = await getSource(s.id)
    expect(row?.name).toBe('Stripe board')
    expect(row?.kind).toBe('greenhouse')
    expect(row?.config).toEqual({ company: 'stripe', companyId: 'keep-me' })
    expect(row?.lastError).toBeNull()
    expect(row?.errorCount).toBe(0)
  })

  it('keeps the error history when only the name changes', async () => {
    const me = await makeUser()
    const s = await makeSource(me.id, {
      kind: 'lever',
      config: { company: 'netflix' },
      lastError: 'HTTP 500',
      errorCount: 2,
    })
    sessionMock.mockResolvedValue(me.id)
    expect(await updateSource(s.id, fd({ name: 'Netflix', company: 'netflix' }))).toEqual({
      success: true,
    })
    const row = await getSource(s.id)
    expect(row?.errorCount).toBe(2)
  })

  it('edits the feed URL of an RSS source and can toggle enabled', async () => {
    const me = await makeUser()
    const s = await makeSource(me.id, { kind: 'rss', config: { url: 'https://a.com/feed' } })
    sessionMock.mockResolvedValue(me.id)
    const r = await updateSource(
      s.id,
      fd({ name: 'Jobs feed', url: 'https://b.com/jobs.rss', enabled: 'false' }),
    )
    expect(r).toEqual({ success: true })
    const row = await getSource(s.id)
    expect(row?.config).toEqual({ url: 'https://b.com/jobs.rss' })
    expect(row?.enabled).toBe(false)
  })

  it('auto-names a source when the name is blank', async () => {
    const me = await makeUser()
    const s = await makeSource(me.id, { kind: 'ashby', config: { company: 'ramp' } })
    sessionMock.mockResolvedValue(me.id)
    await updateSource(s.id, fd({ name: '', company: 'linear' }))
    expect((await getSource(s.id))?.name).toBe('ashby — company: linear')
  })

  it('validates the kind-specific field', async () => {
    const me = await makeUser()
    const gh = await makeSource(me.id, { kind: 'greenhouse', config: { company: 'x' } })
    const rss = await makeSource(me.id, { kind: 'rss', config: { url: 'https://a.com/f' } })
    sessionMock.mockResolvedValue(me.id)
    expect(await updateSource(gh.id, fd({ name: 'X', company: '' }))).toEqual({
      error: 'Board slug is required for this source.',
    })
    expect(await updateSource(gh.id, fd({ name: 'X', company: 'bad slug!' }))).toEqual({
      error: 'Board slug may only contain letters, numbers, dots, dashes and underscores.',
    })
    expect(await updateSource(rss.id, fd({ name: 'X', url: 'not a url' }))).toEqual({
      error: 'Enter a valid feed URL.',
    })
  })

  it('edits only the name of a source without config (RemoteOK etc.)', async () => {
    const me = await makeUser()
    const s = await makeSource(me.id, { kind: 'remoteok', config: {} })
    sessionMock.mockResolvedValue(me.id)
    expect(await updateSource(s.id, fd({ name: 'Remote jobs' }))).toEqual({ success: true })
    const row = await getSource(s.id)
    expect(row?.name).toBe('Remote jobs')
    expect(row?.config).toEqual({})
  })

  it("cannot edit another user's source", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await makeSource(other.id, { name: 'Theirs', kind: 'lever', config: { company: 'a' } })
    sessionMock.mockResolvedValue(me.id)
    expect(await updateSource(theirs.id, fd({ name: 'Mine now', company: 'b' }))).toEqual({
      error: 'Source not found.',
    })
    expect((await getSource(theirs.id))?.name).toBe('Theirs')
  })
})

describe('removeSource / toggleSourceEnabled scoping', () => {
  it("cannot remove or toggle another user's source", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await makeSource(other.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await removeSource(theirs.id)).toEqual({ error: 'Source not found.' })
    expect(await toggleSourceEnabled(theirs.id, false)).toEqual({ error: 'Source not found.' })
    expect((await getSource(theirs.id))?.enabled).toBe(true)
  })
})

describe('first poll is queued immediately', () => {
  async function pollsFor(userId: string) {
    return (await db.select().from(queueJobs).where(eq(queueJobs.userId, userId))).filter(
      (j) => j.type === JOB_TYPES.discoverySource,
    )
  }

  it('adding a source queues its first search (no wait for the daily scheduler)', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    expect(await addSource(fd({ kind: 'remoteok' }))).toEqual({ success: true })
    expect(await pollsFor(me.id)).toHaveLength(1)
  })

  it('re-enabling a source queues a search; disabling does not', async () => {
    const me = await makeUser()
    const src = await makeSource(me.id)
    sessionMock.mockResolvedValue(me.id)
    await toggleSourceEnabled(src.id, false)
    expect(await pollsFor(me.id)).toHaveLength(0)
    await toggleSourceEnabled(src.id, true)
    expect(await pollsFor(me.id)).toHaveLength(1)
  })
})
